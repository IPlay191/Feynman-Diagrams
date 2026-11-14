// Night-time lights for each region from NASA Black Marble, served by NASA GIBS (no login needed).
//
//   npm run fetch:lights   -> public/data/lights.json
//
// Layers used:
//   VIIRS_Black_Marble (annual composites 2012 and 2016)
//   VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance (daily Black Marble VJ146A2)
// The tiles are colorized images, so the value we store is relative brightness (0-100),
// good for comparing places and dates, not a calibrated radiance.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { REGIONS, pointInPolygon, regionBBox } from '../shared/regions.js';

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const Z = 8; // GoogleMapsCompatible_Level8 is the native max zoom of these layers

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;

const tileCache = new Map();
async function tile(layer, date, x, y) {
  const url = `${GIBS}/${layer}/default/${date}/GoogleMapsCompatible_Level8/${Z}/${y}/${x}.png`;
  if (!tileCache.has(url)) {
    tileCache.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    })());
  }
  return tileCache.get(url);
}

// Average brightness (luma of the colorized pixel, 0-100) inside a region polygon.
async function regionBrightness(layer, date, region) {
  const [w, s, e, n] = regionBBox(region.id);
  const pxW = Math.floor(lon2x(w, Z) * 256), pxE = Math.ceil(lon2x(e, Z) * 256);
  const pxN = Math.floor(lat2y(n, Z) * 256), pxS = Math.ceil(lat2y(s, Z) * 256);
  let sum = 0, count = 0;
  for (let py = pxN; py <= pxS; py++) {
    for (let px = pxW; px <= pxE; px++) {
      const lon = (px / 256 / 2 ** Z) * 360 - 180;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / 256 / 2 ** Z))) * 180) / Math.PI;
      if (!pointInPolygon([lon, lat], region.polygon)) continue;
      const t = await tile(layer, date, Math.floor(px / 256), Math.floor(py / 256));
      if (!t) continue;
      const i = ((py % 256) * 256 + (px % 256)) * 4;
      const [r, g, b, a] = t.data.subarray(i, i + 4);
      if (a === 0) { count++; continue; } // transparent = no light
      sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55;
      count++;
    }
  }
  return count ? Math.round((10 * sum) / count) / 10 : null;
}

async function main() {
  const nisar = JSON.parse(await fs.readFile(path.resolve('public/data/nisar.json'), 'utf8'));
  const annual = ['2012-01-01', '2016-01-01'];
  // One date per NISAR pass. Daily images can have clouds or moonlight, so we take the
  // brightest of the three nights around each pass.
  const daily = nisar.dates.map((d) => d.date);
  const shift = (d, k) => new Date(Date.parse(d) + k * 86_400_000).toISOString().slice(0, 10);

  const out = {
    generated: new Date().toISOString(),
    source: {
      annual: 'NASA Black Marble annual composite (VIIRS_Black_Marble) via NASA GIBS',
      daily: 'NASA Black Marble daily, NOAA-20 VIIRS gap-filled BRDF-corrected Day/Night Band (VJ146A2) via NASA GIBS',
      note: 'Relative brightness 0-100 from the colorized GIBS tiles, not calibrated radiance.',
    },
    regions: {},
  };

  for (const region of Object.values(REGIONS)) {
    const annualVals = [];
    for (const d of annual) annualVals.push({ date: d.slice(0, 4), value: await regionBrightness('VIIRS_Black_Marble', d, region) });
    const dailyVals = [];
    for (const d of daily) {
      const vals = [];
      for (const k of [-1, 0, 1]) vals.push(await regionBrightness('VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance', shift(d, k), region));
      const ok = vals.filter((v) => v !== null);
      dailyVals.push({ date: d, value: ok.length ? Math.max(...ok) : null });
    }
    out.regions[region.id] = { annual: annualVals, daily: dailyVals };
    console.log(region.id.padEnd(11), 'annual', annualVals.map((v) => `${v.date}=${v.value}`).join(' '), '| daily', dailyVals.map((v) => v.value).join(' '));
  }
  await fs.writeFile(path.resolve('public/data/lights.json'), JSON.stringify(out, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
