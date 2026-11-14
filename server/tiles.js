// Caching proxy for NASA GIBS map tiles (NISAR radar + Black Marble night lights).
// GIBS sometimes answers bursts of parallel requests with HTTP 500, so we retry and keep
// every tile on disk. Only the two layers below can be requested.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const LAYERS = {
  nisar: { id: 'NISAR_L2_Geocoded_Polarimetric_Covariance', matrix: 'GoogleMapsCompatible_Level13', maxZoom: 13 },
  lights: { id: 'VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance', matrix: 'GoogleMapsCompatible_Level8', maxZoom: 8 },
};
const CACHE = path.resolve('.cache/tiles');
const EMPTY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Limit how many requests we send to GIBS at the same time.
let active = 0;
const queue = [];
async function limited(fn) {
  if (active >= 6) await new Promise((r) => queue.push(r));
  active++;
  try { return await fn(); } finally { active--; queue.shift()?.(); }
}

// GIBS renders NISAR tiles on the fly and sometimes returns a broken tile for a valid request:
// solid opaque black, or gray static (R = G = B = alpha). Real NISAR tiles are never pure black
// (even the ocean is dark blue), so we detect both cases and ask again.
async function looksBroken(buf) {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let black = 0, gray = 0, n = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    n++;
    if (a > 0 && r + g + b < 6) black++;
    else if (a > 0 && Math.abs(r - g) < 3 && Math.abs(g - b) < 3 && Math.abs(r - a) < 3) gray++;
  }
  return black / n > 0.6 || gray / n > 0.4;
}

async function fetchTile(url, checkBroken) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await limited(() => fetch(`${url}?try=${attempt}`));
    if (res.status === 404 || res.status === 400) return { buf: null, final: true }; // no data here
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (!checkBroken || !(await looksBroken(buf).catch(() => true))) return { buf, final: true };
    }
    await sleep(300 * (attempt + 1));
  }
  return { buf: null, final: false }; // still broken: show nothing, try again next time
}

export function tileRoute(req, res) {
  const { layer, date, z, y, x } = req.params;
  const L = LAYERS[layer];
  const zi = Number(z), yi = Number(y), xi = Number(x);
  const valid = L && /^\d{4}-\d{2}-\d{2}$/.test(date) && [zi, yi, xi].every(Number.isInteger) && zi >= 0 && zi <= L.maxZoom && xi >= 0 && yi >= 0 && xi < 2 ** zi && yi < 2 ** zi;
  if (!valid) return res.status(400).end();

  const file = path.join(CACHE, layer, date, String(zi), `${yi}_${xi}.png`);
  (async () => {
    let buf = await fs.readFile(file).catch(() => null);
    let final = true;
    if (!buf) {
      ({ buf, final } = await fetchTile(`${GIBS}/${L.id}/default/${date}/${L.matrix}/${zi}/${yi}/${xi}.png`, layer === 'nisar'));
      if (buf) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, buf);
      }
    }
    res.set('Cache-Control', buf || final ? 'public, max-age=604800' : 'no-store');
    res.type('png').send(buf ?? EMPTY_PNG);
  })().catch(() => res.status(502).end());
}
