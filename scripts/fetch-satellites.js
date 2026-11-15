// Extra satellite pictures for every NISAR date, saved as ready-to-show images.
//
//   npm run fetch:satellites      (run after fetch:nisar; no login needed)
//
// All images come from NASA GIBS (the service behind NASA Worldview) as one picture per date.
// Saving them ahead of time keeps the website fast and stops the map from flickering.
//
//   public/data/sat/city/<date>.webp    NISAR radar at 15 m around Downtown + Miami Beach
//   public/data/sat/fires/<date>.png    fire detections (VIIRS) in the 12 days up to the date
//   public/data/sat/lights/<date>.webp  night lights (NASA Black Marble)
//   public/data/satellites.json         fire counts per region
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { REGIONS, STUDY_BOUNDS as SB, CITY_BOUNDS as CB, pointInPolygon } from '../shared/regions.js';

const OUT = path.resolve('public/data/sat');
const WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const STUDY_W = 1270, STUDY_H = 820; // ~110 m per pixel over the whole study area
const CITY_W = 704, CITY_H = 896; // ~15 m per pixel (NISAR native mosaic resolution)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shift = (d, k) => new Date(Date.parse(d) + k * 86_400_000).toISOString().slice(0, 10);
const bbox = (b) => `${b.west},${b.south},${b.east},${b.north}`;

async function wms(layer, date, b, w, h, format = 'image/png') {
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: layer, SRS: 'EPSG:4326',
    BBOX: bbox(b), WIDTH: String(w), HEIGHT: String(h), FORMAT: format, TRANSPARENT: 'true', TIME: date,
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${WMS}?${q}&try=${attempt}`);
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && type.startsWith('image/')) return Buffer.from(await res.arrayBuffer());
    await sleep(500 * (attempt + 1));
  }
  return null;
}

async function pixels(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// GIBS sometimes renders a broken NISAR picture (solid black or gray static). Detect it.
function brokenShare({ data }) {
  let bad = 0, n = 0;
  for (let i = 0; i < data.length; i += 4 * 9) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    n++;
    if (a > 0 && r + g + b < 6) bad++;
    else if (a > 0 && Math.abs(r - g) < 3 && Math.abs(g - b) < 3 && Math.abs(r - a) < 3) bad++;
  }
  return bad / n;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// Counts separate fire spots inside a polygon (connected groups of fire pixels).
function countSpots(mask, w, h, poly) {
  const seen = new Uint8Array(w * h);
  let spots = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const x = i % w, y = Math.floor(i / w);
    const lon = SB.west + ((x + 0.5) / w) * (SB.east - SB.west);
    const lat = SB.north - ((y + 0.5) / h) * (SB.north - SB.south);
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const jx = j % w, jy = Math.floor(j / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (pointInPolygon([lon, lat], poly)) spots++;
  }
  return spots;
}

async function main() {
  const nisar = JSON.parse(await fs.readFile(path.resolve('public/data/nisar.json'), 'utf8'));
  const dates = nisar.dates.map((d) => d.date);
  for (const d of ['city', 'fires', 'lights']) await fs.mkdir(path.join(OUT, d), { recursive: true });

  const out = {
    generated: new Date().toISOString(),
    studyBounds: SB,
    cityBounds: CB,
    sources: {
      city: 'NISAR GCOV daily mosaic (NISAR_L2_Geocoded_Polarimetric_Covariance), NASA GIBS',
      fires: 'VIIRS 375 m fire detections, NOAA-20 + NOAA-21 (Thermal_Anomalies_375m_All), NASA GIBS',
      lights: 'NASA Black Marble, NOAA-20 VIIRS gap-filled (VJ146A2), NASA GIBS',
    },
    dates: {},
  };

  for (const date of dates) {
    const rec = { cityOk: false, fires: {} };

    // 1. Sharp NISAR radar over the city
    const cityFile = path.join(OUT, 'city', `${date}.webp`);
    if (await exists(cityFile)) rec.cityOk = true;
    else {
      for (let attempt = 0; attempt < 6 && !rec.cityOk; attempt++) {
        const buf = await wms('NISAR_L2_Geocoded_Polarimetric_Covariance', date, CB, CITY_W, CITY_H);
        if (buf && brokenShare(await pixels(buf)) < 0.3) {
          await sharp(buf).webp({ quality: 78 }).toFile(cityFile);
          rec.cityOk = true;
        }
      }
    }

    // 2. Fire detections: everything detected in the 12 days up to this NISAR pass
    const fireMask = new Uint8Array(STUDY_W * STUDY_H);
    for (let k = -11; k <= 0; k++) {
      for (const layer of ['VIIRS_NOAA20_Thermal_Anomalies_375m_All', 'VIIRS_NOAA21_Thermal_Anomalies_375m_All']) {
        const buf = await wms(layer, shift(date, k), SB, STUDY_W, STUDY_H);
        if (!buf) continue;
        const { data } = await pixels(buf);
        for (let i = 0; i < STUDY_W * STUDY_H; i++) if (data[i * 4 + 3] > 0) fireMask[i] = 1;
      }
    }
    const fireImg = Buffer.alloc(STUDY_W * STUDY_H * 4);
    for (let i = 0; i < fireMask.length; i++) if (fireMask[i]) fireImg.set([255, 69, 0, 255], i * 4);
    await sharp(fireImg, { raw: { width: STUDY_W, height: STUDY_H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'fires', `${date}.png`));
    for (const r of Object.values(REGIONS)) rec.fires[r.id] = countSpots(fireMask, STUDY_W, STUDY_H, r.polygon);
    rec.fires.all = countSpots(fireMask, STUDY_W, STUDY_H, [[SB.west, SB.south], [SB.east, SB.south], [SB.east, SB.north], [SB.west, SB.north]]);

    // 3. Night lights (brightest of 3 nights, to skip cloudy ones)
    const lightsFile = path.join(OUT, 'lights', `${date}.webp`);
    let bestLight = null;
    for (const k of [0, -1, 1]) {
      const buf = await wms('VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance', shift(date, k), SB, 635, 410);
      if (!buf) continue;
      const { data } = await pixels(buf);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4 * 3) sum += data[i] + data[i + 1] + data[i + 2];
      if (!bestLight || sum > bestLight.sum) bestLight = { buf, sum };
    }
    if (bestLight) {
      // make dark areas see-through so the map shows underneath
      const { data, width, height } = await pixels(bestLight.buf);
      for (let i = 0; i < data.length; i += 4) {
        const lum = Math.max(data[i], data[i + 1], data[i + 2]);
        data[i + 3] = Math.min(255, lum * 2);
      }
      await sharp(data, { raw: { width, height, channels: 4 } }).webp({ quality: 80 }).toFile(lightsFile);
    }

    out.dates[date] = rec;
    console.log(date, `city:${rec.cityOk ? 'ok' : 'MISSING'}`, 'fires:', JSON.stringify(rec.fires));
  }

  await fs.writeFile(path.resolve('public/data/satellites.json'), JSON.stringify(out, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
