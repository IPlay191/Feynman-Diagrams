// Weather maps (a grid of values over South Florida) from the Meteomatics API, one per NISAR date.
//
//   npm run fetch:weather-maps     (needs METEOMATICS_USERNAME / METEOMATICS_PASSWORD in .env)
//
// Each map summarizes the 12 days up to a NISAR pass (the time between two passes), so it
// matches what the radar saw.  Output: public/data/weather-maps.json
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { STUDY_BOUNDS as SB } from '../shared/regions.js';

const RES = 0.04; // degrees, ~4 km
export const WEATHER_MAPS = {
  rain: { param: 'precip_24h:mm', how: 'sum', label: 'Rain in the last 12 days', unit: 'mm' },
  plants: { param: 'evapotranspiration_24h:mm', how: 'mean', label: 'Water given off by plants (daily average)', unit: 'mm' },
  heat: { param: 't_max_2m_24h:C', how: 'mean', label: 'Afternoon high temperature (average)', unit: '°C' },
  pm25: { param: 'pm2p5:ugm3', how: 'mean', label: 'Fine particles PM2.5 (average)', unit: 'µg/m³' },
};

const auth = () => 'Basic ' + Buffer.from(`${process.env.METEOMATICS_USERNAME}:${process.env.METEOMATICS_PASSWORD}`).toString('base64');
const shift = (d, k) => new Date(Date.parse(d) + k * 86_400_000).toISOString().slice(0, 10);

async function grid(param, start, end) {
  const url = `https://api.meteomatics.com/${start}T12:00:00Z--${end}T12:00:00Z:P1D/${param}/${SB.north},${SB.west}_${SB.south},${SB.east}:${RES},${RES}/json`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: auth() }, signal: AbortSignal.timeout(90_000) });
      if (res.ok) return (await res.json()).data[0].coordinates;
      console.warn(`  Meteomatics HTTP ${res.status}, retrying...`);
    } catch (e) {
      console.warn(`  ${e.name === 'TimeoutError' ? 'timed out' : e.message}, retrying...`);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`Meteomatics failed for ${param} ${start}..${end}`);
}

async function main() {
  if (!process.env.METEOMATICS_USERNAME) throw new Error('Set METEOMATICS_USERNAME and METEOMATICS_PASSWORD in .env');
  const nisar = JSON.parse(await fs.readFile(path.resolve('public/data/nisar.json'), 'utf8'));
  const dates = nisar.dates.map((d) => d.date);

  const file = path.resolve('public/data/weather-maps.json');
  // Resume: keep maps that are already complete (re-run with --fresh to start over)
  let out = { generated: new Date().toISOString(), source: 'Meteomatics Weather API', bounds: SB, res: RES, maps: {} };
  if (!process.argv.includes('--fresh')) {
    try { out = { ...JSON.parse(await fs.readFile(file, 'utf8')), generated: out.generated }; } catch { /* first run */ }
  }
  for (const [id, def] of Object.entries(WEATHER_MAPS)) {
    if (out.maps[id] && dates.every((d) => out.maps[id].values[d])) {
      console.log(`${id}: already done`);
      continue;
    }
    const m = { ...def, lats: null, lons: null, values: {}, min: Infinity, max: -Infinity };
    for (const date of dates) {
      process.stdout.write(`  ${id} ${date}\r`);
      const coords = await grid(def.param, shift(date, -11), date);
      if (!m.lats) {
        m.lats = [...new Set(coords.map((c) => c.lat))].sort((a, b) => b - a);
        m.lons = [...new Set(coords.map((c) => c.lon))].sort((a, b) => a - b);
      }
      const cells = new Array(m.lats.length * m.lons.length).fill(null);
      for (const c of coords) {
        const vals = c.dates.map((x) => x.value).filter((v) => v !== null && v > -666);
        if (!vals.length) continue;
        const v = def.how === 'sum' ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length;
        const idx = m.lats.indexOf(c.lat) * m.lons.length + m.lons.indexOf(c.lon);
        cells[idx] = Math.round(v * 10) / 10;
        m.min = Math.min(m.min, cells[idx]);
        m.max = Math.max(m.max, cells[idx]);
      }
      m.values[date] = cells;
    }
    out.maps[id] = m;
    await fs.writeFile(file, JSON.stringify(out)); // save after every map
    console.log(`${id}: ${m.lats.length}x${m.lons.length} grid, ${dates.length} dates, range ${m.min}..${m.max} ${def.unit}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
