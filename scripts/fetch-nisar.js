// Step 1 of the NISAR pipeline: find and download NISAR GCOV browse images over South Florida.
//
//   npm run fetch:nisar                     -> search ASF, download (cached in data/raw/nisar), analyze
//   npm run fetch:nisar -- --analyze-only   -> skip search/download, only re-run the analysis
//
// Source: ASF DAAC Search API, the same archive behind ASF Vertex and NASA Earthdata Search.
// Downloads use NASA Earthdata Login (EARTHDATA_USERNAME / EARTHDATA_PASSWORD in .env).
//
// Ascending track 47 passes over Miami every 12 days. Frames 14 and 15 are back-to-back pieces of
// the same pass; together they cover Downtown, Miami Beach and most of the Everglades, so every
// date lines up pixel-for-pixel for change detection.
import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadProtected } from './lib/earthdata.js';
import { analyzeAll } from './analyze-nisar.js';

const TRACK = 47;
const FRAMES = [14, 15];
const RAW_DIR = path.resolve('data/raw/nisar');

function searchUrl(frame) {
  return (
    'https://api.daac.asf.alaska.edu/services/search/param?' +
    new URLSearchParams({
      platform: 'NISAR',
      processingLevel: 'GCOV',
      relativeOrbit: String(TRACK),
      frame: String(frame),
      output: 'geojson',
      maxResults: '500',
    })
  );
}

// When several products exist for one date and frame, prefer: production pipeline ("_P0"),
// full frame ("_F_J_"), 40 MHz bandwidth ("_4005_", sharper), largest browse image, newest counter.
function score(p, pngBytes) {
  const id = p.fileID;
  let s = 0;
  if (/_P0\d{4}_/.test(id)) s += 1000;
  if (/_F_J_\d{3}$/.test(id)) s += 100;
  if (/_4005_/.test(id)) s += 50;
  s += pngBytes / 1e6;
  s += (Number(id.slice(-3)) || 0) / 100;
  return s;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function downloadKml(scene) {
  // The KML gives the image's lat/lon corners. PROVISIONAL products keep it next to the .h5
  // product, VALIDATED products keep it in the browse folder.
  const candidates = [
    scene.h5.replace(/[^/]+$/, `${scene.fileID}_LATLON.kml`),
    scene.browse.replace(/\.png$/, '.kml'),
  ];
  for (const u of candidates) {
    try { return await downloadProtected(u); } catch { /* try next */ }
  }
  throw new Error(`No KML found for ${scene.fileID}`);
}

async function main() {
  const analyzeOnly = process.argv.includes('--analyze-only');
  await fs.mkdir(RAW_DIR, { recursive: true });

  if (!analyzeOnly) {
    const scenes = [];
    for (const frame of FRAMES) {
      console.log(`Searching ASF for NISAR GCOV, track ${TRACK} frame ${frame} ...`);
      const res = await fetch(searchUrl(frame));
      if (!res.ok) throw new Error(`ASF search failed: HTTP ${res.status}`);
      const { features } = await res.json();
      const best = new Map();
      for (const f of features) {
        const p = f.properties;
        const browse = (p.browse || []).find((u) => u.endsWith('_LATLON.png'));
        if (!browse) continue;
        const pngBytes = Object.entries(p.bytes || {}).find(([k]) => k.endsWith('_LATLON.png'))?.[1]?.bytes ?? 0;
        const date = p.startTime.slice(0, 10);
        const s = score(p, pngBytes);
        if (!best.has(date) || s > best.get(date).score) {
          best.set(date, { date, frame, score: s, fileID: p.fileID, startTime: p.startTime, browse, h5: p.url });
        }
      }
      console.log(`  ${features.length} products -> ${best.size} dates`);
      scenes.push(...best.values());
    }

    // Keep only dates where both frames exist, so every date covers the same ground.
    const dates = [...new Set(scenes.map((s) => s.date))]
      .filter((d) => FRAMES.every((fr) => scenes.some((s) => s.date === d && s.frame === fr)))
      .sort();
    const kept = scenes.filter((s) => dates.includes(s.date)).sort((a, b) => a.date.localeCompare(b.date) || a.frame - b.frame);
    console.log(`${dates.length} dates have both frames.`);

    for (const s of kept) {
      const base = path.join(RAW_DIR, `${s.date}_f${s.frame}`);
      if (!(await exists(base + '.png'))) {
        process.stdout.write(`  downloading ${s.date} frame ${s.frame} ... `);
        await fs.writeFile(base + '.png', await downloadProtected(s.browse));
        console.log('ok');
      }
      if (!(await exists(base + '.kml'))) await fs.writeFile(base + '.kml', await downloadKml(s));
    }
    await fs.writeFile(path.join(RAW_DIR, 'scenes.json'), JSON.stringify(kept, null, 2));
  }

  await analyzeAll(RAW_DIR);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
