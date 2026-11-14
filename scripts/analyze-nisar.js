// Step 2 of the NISAR pipeline: turn the downloaded browse images into numbers and change maps.
//
// NISAR GCOV browse images are false-color: red = HH, green = HV, blue = HH (red always equals
// blue in the pixels; matches the ASF NISAR Data User Guide's dual-pol recipe). Pixel values are display brightness (0-255), not calibrated
// backscatter, so every number here is a RELATIVE indicator. That is good enough to show
// patterns over time, but it is not a scientific measurement.
//
// Output (used by the website):
//   public/data/nisar.json                  per-region statistics for every date
//   public/data/nisar/change/<date>.png     change map vs. the first date
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { loadScene } from './lib/scene.js';
import { REGIONS, pointInPolygon } from '../shared/regions.js';

// Study area covering all three regions, sampled on a ~200 m grid (the browse resolution).
export const STUDY_BOUNDS = { west: -81.32, south: 25.1, east: -80.05, north: 25.92 };
const STEP = 0.0018;

// Land-cover classes from the browse colors (calibrated against known places).
const WATER_MAX = 110; // HH and HV both dark   -> smooth open water
const BRIGHT_HH = 245; // HH and HV both bright -> buildings, or flooded vegetation (both are double bounce)
const BRIGHT_HV = 235;
const CHANGE_MIN = 35; // brightness difference that counts as "changed"

function classify(hh, hv) {
  if (hh < WATER_MAX && hv < WATER_MAX) return 'water';
  if (hh >= BRIGHT_HH && hv >= BRIGHT_HV) return 'bright';
  return 'vegetation';
}

export async function analyzeAll(rawDir) {
  const scenes = JSON.parse(await fs.readFile(path.join(rawDir, 'scenes.json'), 'utf8'));
  const dates = [...new Set(scenes.map((s) => s.date))].sort();

  const cols = Math.round((STUDY_BOUNDS.east - STUDY_BOUNDS.west) / STEP);
  const rows = Math.round((STUDY_BOUNDS.north - STUDY_BOUNDS.south) / STEP);
  const cellLon = (c) => STUDY_BOUNDS.west + (c + 0.5) * STEP;
  const cellLat = (r) => STUDY_BOUNDS.north - (r + 0.5) * STEP;

  // Which grid cells belong to which region
  const regionCells = {};
  for (const [id, reg] of Object.entries(REGIONS)) {
    regionCells[id] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (pointInPolygon([cellLon(c), cellLat(r)], reg.polygon)) regionCells[id].push(r * cols + c);
  }

  // Sample every date onto the common grid (frame 14 first, frame 15 fills the gaps).
  const grids = [];
  for (const date of dates) {
    const frames = await Promise.all(
      scenes.filter((s) => s.date === date).sort((a, b) => a.frame - b.frame).map((s) => loadScene(path.join(rawDir, `${date}_f${s.frame}`))),
    );
    const hh = new Uint8Array(rows * cols);
    const hv = new Uint8Array(rows * cols);
    const valid = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        for (const f of frames) {
          const p = f.sample(cellLon(c), cellLat(r));
          if (p && p[3] > 0 && p[0] + p[1] > 0) {
            const i = r * cols + c;
            hh[i] = p[0];
            hv[i] = p[1];
            valid[i] = 1;
            break;
          }
        }
      }
    grids.push({ date, hh, hv, valid });
  }

  // Baseline = earliest date that covers at least 90 % of every region.
  const coverage = (g, id) => regionCells[id].filter((i) => g.valid[i]).length / regionCells[id].length;
  const skipped = grids.filter((g) => !Object.keys(REGIONS).every((id) => coverage(g, id) >= 0.9));
  for (const g of skipped) {
    console.log(`  skipping ${g.date}: does not cover all regions`);
    grids.splice(grids.indexOf(g), 1);
  }
  const baseline = grids[0];

  const changeDir = path.resolve('public/data/nisar/change');
  await fs.rm(changeDir, { recursive: true, force: true });
  await fs.mkdir(changeDir, { recursive: true });
  const radarDir = path.resolve('public/data/nisar/radar');
  await fs.rm(radarDir, { recursive: true, force: true });
  await fs.mkdir(radarDir, { recursive: true });

  const out = {
    generated: new Date().toISOString(),
    source: {
      mission: 'NISAR (NASA-ISRO Synthetic Aperture Radar), L-band, 12-day repeat',
      product: 'L2 GCOV (Geocoded Polarimetric Covariance) browse images, ASF DAAC',
      track: 47,
      frames: [14, 15],
      direction: 'ascending',
      note: 'Values are relative brightness of the GCOV browse images (red/blue = HH, green = HV), not calibrated backscatter.',
    },
    studyBounds: STUDY_BOUNDS,
    baselineDate: baseline.date,
    dates: [],
    regions: Object.fromEntries(Object.keys(REGIONS).map((id) => [id, []])),
  };

  for (const g of grids) {
    const scene = scenes.find((s) => s.date === g.date);
    out.dates.push({ date: g.date, time: scene.startTime, granules: scenes.filter((s) => s.date === g.date).map((s) => s.fileID) });

    for (const [id, cells] of Object.entries(regionCells)) {
      let n = 0, water = 0, bright = 0, veg = 0, sumHH = 0, sumHV = 0, changed = 0, brighter = 0, darker = 0, both = 0;
      for (const i of cells) {
        if (!g.valid[i]) continue;
        n++;
        sumHH += g.hh[i];
        sumHV += g.hv[i];
        const cls = classify(g.hh[i], g.hv[i]);
        if (cls === 'water') water++;
        else if (cls === 'bright') bright++;
        else veg++;
        if (baseline.valid[i]) {
          both++;
          const d = (g.hh[i] + g.hv[i]) / 2 - (baseline.hh[i] + baseline.hv[i]) / 2;
          if (Math.abs(d) >= CHANGE_MIN) { changed++; d > 0 ? brighter++ : darker++; }
        }
      }
      const pct = (x, of = n) => (of ? Math.round((1000 * x) / of) / 10 : null);
      out.regions[id].push({
        date: g.date,
        coverage: pct(n, cells.length),
        water: pct(water),
        vegetation: pct(veg),
        bright: pct(bright),
        meanHH: n ? Math.round((10 * sumHH) / n) / 10 : null,
        meanHV: n ? Math.round((10 * sumHV) / n) / 10 : null,
        changedVsBaseline: pct(changed, both),
        brighterVsBaseline: pct(brighter, both),
        darkerVsBaseline: pct(darker, both),
      });
    }

    // Change map: orange = brighter than baseline (more structure / double bounce / wetter
    // vegetation), blue = darker (more open water, burned or cleared vegetation).
    const img = Buffer.alloc(rows * cols * 4);
    for (let i = 0; i < rows * cols; i++) {
      if (!g.valid[i] || !baseline.valid[i]) continue;
      // ignore open water in both dates (wind ripples on the sea are not surface change)
      if (classify(g.hh[i], g.hv[i]) === 'water' && classify(baseline.hh[i], baseline.hv[i]) === 'water') continue;
      const d = (g.hh[i] + g.hv[i]) / 2 - (baseline.hh[i] + baseline.hv[i]) / 2;
      if (Math.abs(d) < CHANGE_MIN) continue;
      const a = Math.min(255, 90 + Math.abs(d) * 2);
      const [r, gg, b] = d > 0 ? [249, 115, 22] : [59, 130, 246];
      img.set([r, gg, b, a], i * 4);
    }
    await sharp(img, { raw: { width: cols, height: rows, channels: 4 } }).png().toFile(path.join(changeDir, `${g.date}.png`));

    // Radar picture for this pass, rebuilt from the ASF browse images (red/blue = HH, green = HV).
    // The website shows it when zoomed out; NASA GIBS's sharper tiles take over when zoomed in.
    // A contrast curve (display only, the statistics above use the raw values) keeps the bright
    // browse values from washing out into white.
    const curve = (v) => Math.round(255 * (v / 255) ** 2.4);
    const radar = Buffer.alloc(rows * cols * 4);
    for (let i = 0; i < rows * cols; i++) {
      if (!g.valid[i]) continue;
      radar.set([curve(g.hh[i]), curve(g.hv[i]), curve(g.hh[i]), 255], i * 4);
    }
    await sharp(radar, { raw: { width: cols, height: rows, channels: 4 } }).webp({ quality: 82 }).toFile(path.join(radarDir, `${g.date}.webp`));
  }

  await fs.writeFile(path.resolve('public/data/nisar.json'), JSON.stringify(out, null, 1));
  console.log(`Analyzed ${grids.length} dates on a ${cols}x${rows} grid. Baseline: ${baseline.date}`);
  for (const id of Object.keys(REGIONS)) {
    const s = out.regions[id];
    const f = s[0], l = s.at(-1);
    console.log(`  ${id.padEnd(11)} cells=${regionCells[id].length}  ${f.date}: water ${f.water}% veg ${f.vegetation}% bright ${f.bright}% (cov ${f.coverage}%)  ->  ${l.date}: water ${l.water}% veg ${l.vegetation}% bright ${l.bright}% (cov ${l.coverage}%)`);
  }
}
