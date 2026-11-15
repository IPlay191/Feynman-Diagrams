// Step 2 of the La Guaira pipeline: turn the downloaded NISAR files into small pictures and numbers.
//
// 1. Fringe pictures: every GUNW browse image, cut to La Guaira (land only). Each full cycle of
//    colors ("fringe") is about 12 cm of ground movement toward or away from the satellite.
// 2. Ground movement in centimeters for the biggest quake: the full GUNW files (.h5) of the
//    pass pairs that span the quake, from both directions NISAR flies (ascending + descending).
//    Seeing the ground from two sides lets us split the movement into sideways (east-west) and
//    up/down. The same is done for the 12 days before the quake, to show how small the normal
//    "noise" is.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { toUtm } from './lib/utm.js';
import { LG_POLYGON, LG_BOUNDS, LG_TOWNS, LG_QUAKE_KM } from '../shared/laguaira.js';
import { pointInPolygon } from '../shared/regions.js';

const OUT_DIR = path.resolve('public/data/laguaira');
const STEP = 0.001; // output grid, degrees (~110 m)
const COARSE = 5; // 3D columns: 5 x 5 grid cells (~550 m)
const GW = Math.round((LG_BOUNDS.east - LG_BOUNDS.west) / STEP);
const GH = Math.round((LG_BOUNDS.north - LG_BOUNDS.south) / STEP);
const lonAt = (x) => LG_BOUNDS.west + (x + 0.5) * STEP;
const latAt = (y) => LG_BOUNDS.north - (y + 0.5) * STEP;

export function h5Dir() {
  return process.env.LAGUAIRA_H5_DIR || path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'dws-h5');
}

const median = (v) => {
  if (!v.length) return NaN;
  const s = Float64Array.from(v).sort();
  return s[s.length >> 1];
};
const km = (lon1, lat1, lon2, lat2) => {
  const r = Math.PI / 180;
  const dx = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const dy = (lat2 - lat1) * r;
  return Math.hypot(dx, dy) * 6371;
};
function kmToPolygon(lon, lat) {
  if (pointInPolygon([lon, lat], LG_POLYGON)) return 0;
  return Math.min(...LG_POLYGON.map(([x, y]) => km(lon, lat, x, y)));
}

// inside-the-state flag for every output grid cell
const inside = new Uint8Array(GW * GH);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) inside[y * GW + x] = pointInPolygon([lonAt(x), latAt(y)], LG_POLYGON) ? 1 : 0;

// ---------------- full GUNW files (.h5) ----------------

let h5wasm = null;
async function openH5(file) {
  if (!h5wasm) {
    h5wasm = (await import('h5wasm/node')).default;
    await h5wasm.ready;
  }
  return new h5wasm.File(file, 'r');
}

// Reads one GUNW file onto the La Guaira grid: line-of-sight movement (cm, + = toward the
// satellite), the satellite's look direction, and a land/water flag.
async function readGunw(file, quake) {
  const f = await openH5(file);
  const G = '/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram';
  const R = '/science/LSAR/GUNW/metadata/radarGrid';
  const xs = f.get(`${G}/xCoordinates`).value;
  const ys = f.get(`${G}/yCoordinates`).value;
  const W = xs.length, H = ys.length, dx = xs[1] - xs[0], dy = ys[1] - ys[0];
  const zone = Number(f.get(`${G}/projection`).value) - 32600;
  const wavelength = 299792458 / Number(f.get('/science/LSAR/GUNW/grids/frequencyA/centerFrequency').value);
  const cmPerRad = (wavelength / (4 * Math.PI)) * 100;
  const ph = f.get(`${G}/HH/unwrappedPhase`).value;
  const coh = f.get(`${G}/HH/coherenceMagnitude`).value;
  const cc = f.get(`${G}/HH/connectedComponents`).value;
  const ion = f.get(`${G}/HH/ionospherePhaseScreen`).value;
  const mask = f.get(`${G}/mask`).value;
  // mask, lowest byte as 3 decimal digits: water flag, reference subswath, secondary subswath
  const water = (i) => Math.floor((mask[i] & 0xff) / 100) === 1;
  const usable = (i) => Number.isFinite(ph[i]) && coh[i] > 0.3 && cc[i] > 0 && !water(i);
  // ionosphere: L-band radar is slowed by the charged upper atmosphere; NISAR estimates that
  // delay ("ionosphere phase screen") but does not remove it, so we do.
  const value = (i) => ph[i] - (Number.isFinite(ion[i]) ? ion[i] : 0);

  // Unwrapped phase has an arbitrary offset; measure everything against the median of ground
  // more than 90 km from the quake (which did not move).
  const [ex, ey] = toUtm(quake.lon, quake.lat, zone);
  const far = [];
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const i = y * W + x;
    if (usable(i) && Math.hypot(xs[x] - ex, ys[y] - ey) > 90_000) far.push(value(i));
  }
  const ref = median(far);

  // look direction (unit vector from the ground to the satellite), at sea level
  const rxs = f.get(`${R}/xCoordinates`).value, rys = f.get(`${R}/yCoordinates`).value;
  const k = Math.max(0, f.get(`${R}/heightAboveEllipsoid`).value.findIndex((h) => h >= 0));
  const cube = (n) => f.get(`${R}/${n}`).slice([[k, k + 1], [0, rys.length], [0, rxs.length]]);
  const lxs = cube('losUnitVectorX'), lys = cube('losUnitVectorY');

  const los = new Float32Array(GW * GH).fill(NaN);
  const land = new Uint8Array(GW * GH);
  const vec = new Float32Array(GW * GH * 3);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const o = y * GW + x;
    const [ux, uy] = toUtm(lonAt(x), latAt(y), zone);
    const cx = Math.round((ux - xs[0]) / dx), cy = Math.round((uy - ys[0]) / dy);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    const i = cy * W + cx;
    if ((mask[i] & 0xff) !== 255 && (mask[i] & 0xff) % 100 !== 0 && !water(i)) land[o] = 1;
    if (usable(i)) los[o] = -(value(i) - ref) * cmPerRad;
    const rx = Math.min(rxs.length - 1, Math.max(0, Math.round((ux - rxs[0]) / (rxs[1] - rxs[0]))));
    const ry = Math.min(rys.length - 1, Math.max(0, Math.round((uy - rys[0]) / (rys[1] - rys[0]))));
    const e = lxs[ry * rxs.length + rx], n = lys[ry * rxs.length + rx];
    vec[o * 3] = e; vec[o * 3 + 1] = n; vec[o * 3 + 2] = Math.sqrt(Math.max(0, 1 - e * e - n * n));
  }
  const look = f.get('/science/LSAR/identification/lookDirection').value;
  f.close();
  return { los, land, vec, wavelength, look, refPixels: far.length };
}

// Two looks (ascending + descending) -> east-west and up-down movement per grid cell.
// Radar barely sees north-south movement, so that part is left out.
function decompose(a, b) {
  const east = new Float32Array(GW * GH).fill(NaN);
  const up = new Float32Array(GW * GH).fill(NaN);
  for (let o = 0; o < GW * GH; o++) {
    if (!inside[o] || !Number.isFinite(a.los[o]) || !Number.isFinite(b.los[o])) continue;
    const ae = a.vec[o * 3], au = a.vec[o * 3 + 2], be = b.vec[o * 3], bu = b.vec[o * 3 + 2];
    const det = ae * bu - au * be;
    if (Math.abs(det) < 0.3) continue;
    east[o] = (a.los[o] * bu - au * b.los[o]) / det;
    up[o] = (ae * b.los[o] - a.los[o] * be) / det;
  }
  return { east, up };
}

function around(grid, lon, lat, r) {
  const cx = Math.floor((lon - LG_BOUNDS.west) / STEP), cy = Math.floor((LG_BOUNDS.north - lat) / STEP);
  const v = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
    const g = grid[y * GW + x];
    if (Number.isFinite(g)) v.push(g);
  }
  return v;
}

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

function summarize({ east, up }) {
  const towns = LG_TOWNS.map((t) => {
    const e = around(east, t.lon, t.lat, 3), u = around(up, t.lon, t.lat, 3);
    if (e.length < 6) return { ...t, east: null, up: null, total: null };
    const me = median(e), mu = median(u);
    return { ...t, east: r1(me), up: r1(mu), total: r1(Math.hypot(me, mu)) };
  });
  // 3D columns on a coarser grid
  const columns = [];
  for (let y = 0; y + COARSE <= GH; y += COARSE) for (let x = 0; x + COARSE <= GW; x += COARSE) {
    const e = [], u = [];
    for (let yy = y; yy < y + COARSE; yy++) for (let xx = x; xx < x + COARSE; xx++) {
      const o = yy * GW + xx;
      if (Number.isFinite(east[o])) { e.push(east[o]); u.push(up[o]); }
    }
    if (e.length < (COARSE * COARSE) / 3) continue;
    columns.push([+(lonAt(x) + ((COARSE - 1) / 2) * STEP).toFixed(4), +(latAt(y) - ((COARSE - 1) / 2) * STEP).toFixed(4), r1(median(e)), r1(median(u))]);
  }
  const totals = [];
  for (let o = 0; o < GW * GH; o++) if (Number.isFinite(east[o])) totals.push(Math.hypot(east[o], up[o]));
  totals.sort((p, q) => p - q);
  const pct = (p) => r1(totals[Math.min(totals.length - 1, Math.floor(totals.length * p))]);
  return { towns, columns, typical: pct(0.5), high: pct(0.95), coverage: r1((100 * totals.length) / inside.reduce((s, v) => s + v, 0)) };
}

// colors for "how far the ground moved" (cm); no glow, just a plain ramp
const RAMP = [
  [0, [49, 46, 129, 90]],
  [20, [91, 33, 182, 170]],
  [50, [190, 24, 93, 210]],
  [90, [234, 88, 12, 225]],
  [130, [250, 204, 21, 235]],
];
function rampColor(v) {
  if (v <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    if (v <= RAMP[i][0]) {
      const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i];
      const t = (v - a) / (b - a);
      return ca.map((c, j) => Math.round(c + (cb[j] - c) * t));
    }
  }
  return RAMP.at(-1)[1];
}
export const RAMP_STOPS = RAMP;

async function movementPicture({ east, up }, file) {
  const px = Buffer.alloc(GW * GH * 4);
  for (let o = 0; o < GW * GH; o++) {
    if (!Number.isFinite(east[o])) continue;
    px.set(rampColor(Math.hypot(east[o], up[o])), o * 4);
  }
  await sharp(px, { raw: { width: GW, height: GH, channels: 4 } }).webp({ quality: 90, alphaQuality: 90 }).toFile(file);
}

// ---------------- fringe pictures (browse images) ----------------

function kmlBounds(kml) {
  const c = kml.match(/<coordinates>([^<]+)<\/coordinates>/)[1].trim().split(/\s+/).map((p) => p.split(',').map(Number));
  const lons = c.map((p) => p[0]), lats = c.map((p) => p[1]);
  return { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
}

async function fringePicture(rawBase, land, file) {
  const b = kmlBounds(await fs.readFile(rawBase + '.kml', 'utf8'));
  const { data, info } = await sharp(rawBase + '.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.alloc(GW * GH * 4);
  let any = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const o = y * GW + x;
    if (!inside[o] || (land && !land[o])) continue;
    const sx = Math.floor(((lonAt(x) - b.west) / (b.east - b.west)) * info.width);
    const sy = Math.floor(((b.north - latAt(y)) / (b.north - b.south)) * info.height);
    if (sx < 0 || sy < 0 || sx >= info.width || sy >= info.height) continue;
    const i = (sy * info.width + sx) * 4;
    if (data[i + 3] === 0) continue;
    px[o * 4] = data[i]; px[o * 4 + 1] = data[i + 1]; px[o * 4 + 2] = data[i + 2]; px[o * 4 + 3] = 255;
    any++;
  }
  if (any < 50) return false; // this pass did not cover La Guaira
  await sharp(px, { raw: { width: GW, height: GH, channels: 4 } }).webp({ quality: 82 }).toFile(file);
  return true;
}

// ---------------- main ----------------

const spans = (p, t) => p.fromTime <= t && p.toTime > t;

// On each track: the pass pair that spans the quake, and the pair right before it.
export function movementPairs(pairs, quakeTime) {
  const pick = { during: {}, before: {} };
  for (const tr of new Set(pairs.map((p) => p.track))) {
    const d = pairs.find((p) => p.track === tr && spans(p, quakeTime));
    if (!d) continue;
    pick.during[tr] = d;
    const b = pairs.filter((p) => p.track === tr && p.to <= d.from).at(-1);
    if (b) pick.before[tr] = b;
  }
  return pick;
}

export async function processLaGuaira(rawDir) {
  await fs.mkdir(path.join(OUT_DIR, 'fringes'), { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, 'move'), { recursive: true });
  const pairs = JSON.parse(await fs.readFile(path.join(rawDir, 'pairs.json'), 'utf8'));
  const usgs = JSON.parse(await fs.readFile(path.join(rawDir, 'quakes.geojson'), 'utf8'));

  const quakes = usgs.features
    .map((q) => {
      const [lon, lat, depth] = q.geometry.coordinates;
      const p = q.properties;
      return {
        id: q.id, time: new Date(p.time).toISOString(), mag: p.mag, magType: p.magType, lon, lat, depth: r1(depth),
        place: p.place, felt: p.felt, mmi: r1(p.mmi), alert: p.alert, tsunami: p.tsunami, url: p.url,
        kmFromLaGuaira: r1(kmToPolygon(lon, lat)),
      };
    })
    .filter((q) => q.kmFromLaGuaira <= LG_QUAKE_KM)
    .sort((a, b) => a.time.localeCompare(b.time));
  const big = quakes.reduce((m, q) => (!m || q.mag > m.mag ? q : m), null);
  try {
    const d = JSON.parse(await fs.readFile(path.join(rawDir, 'quake-detail.json'), 'utf8'));
    if (big && d.id === big.id) {
      // rake: about 0 or 180 = the two sides slid past each other sideways
      const rake = Math.abs(d.planes[0].rake);
      big.fault = {
        kind: rake < 30 || rake > 150 ? 'sideways' : d.planes[0].rake > 0 ? 'thrust' : 'normal',
        maxSlipM: d.maxSlipM ? r1(d.maxSlipM) : null,
        lengthKm: d.faultLengthKm,
        planes: d.planes,
      };
    }
  } catch { /* details are optional */ }
  console.log(`${quakes.length} quakes within ${LG_QUAKE_KM} km of La Guaira; biggest M${big?.mag} on ${big?.time}`);

  const tracks = [...new Set(pairs.map((p) => p.track))];
  const pick = big ? movementPairs(pairs, big.time) : { during: {}, before: {} };

  // read the full files we have
  const dir = h5Dir();
  const gunw = {};
  for (const p of [...Object.values(pick.during), ...Object.values(pick.before)]) {
    const file = path.join(dir, `${p.key}.h5`);
    try { await fs.access(file); } catch { console.log(`  (missing ${file}; run fetch:laguaira without --process-only)`); continue; }
    process.stdout.write(`  reading ${p.key}.h5 ... `);
    gunw[p.key] = await readGunw(file, big);
    console.log(`ok (${gunw[p.key].look}-looking, ${gunw[p.key].refPixels} reference pixels)`);
  }

  // land mask from any file we read (NISAR's own water mask)
  let land = null;
  for (const g of Object.values(gunw)) {
    land ??= new Uint8Array(GW * GH);
    for (let o = 0; o < GW * GH; o++) land[o] |= g.land[o];
  }

  // ground movement in cm, during and before the quake
  const movement = {};
  for (const which of ['during', 'before']) {
    const two = tracks.map((t) => pick[which][t]).filter((p) => p && gunw[p.key]);
    if (two.length < 2) continue;
    const [a, b] = two;
    const parts = decompose(gunw[a.key], gunw[b.key]);
    const url = `/data/laguaira/move/${which}.webp`;
    await movementPicture(parts, path.join(OUT_DIR, 'move', `${which}.webp`));
    movement[which] = {
      pairs: two.map((p) => p.key),
      from: two.map((p) => p.from).sort()[0],
      to: two.map((p) => p.to).sort().at(-1),
      url,
      ...summarize(parts),
    };
    console.log(`  ${which}: typical ${movement[which].typical} cm, 95% below ${movement[which].high} cm`);
  }

  // fringe pictures for every pair
  const outPairs = [];
  for (const p of pairs) {
    const ok = await fringePicture(path.join(rawDir, p.key), land, path.join(OUT_DIR, 'fringes', `${p.key}.webp`));
    if (!ok) continue;
    const quakesInside = quakes.filter((q) => spans(p, q.time)).map((q) => q.id);
    outPairs.push({
      key: p.key, track: p.track, direction: p.direction.toLowerCase(), from: p.from, to: p.to, fromTime: p.fromTime, toTime: p.toTime,
      fileID: p.fileID, fringe: `/data/laguaira/fringes/${p.key}.webp`, quakes: quakesInside,
      movement: Object.keys(movement).find((w) => movement[w].pairs.includes(p.key)) ?? null,
    });
  }

  const anyG = Object.values(gunw)[0];
  const out = {
    generated: new Date().toISOString(),
    source: {
      nisar: 'NISAR L2 GUNW (PROVISIONAL), ASF DAAC',
      tracks: tracks.map((t) => ({ track: t, direction: pairs.find((p) => p.track === t).direction.toLowerCase() })),
      usgs: 'USGS ANSS ComCat (earthquake.usgs.gov)',
      wavelengthCm: anyG ? r1(anyG.wavelength * 100) : 24.2,
      cmPerFringe: anyG ? r1((anyG.wavelength * 100) / 2) : 12.1,
    },
    bounds: LG_BOUNDS,
    grid: { width: GW, height: GH, step: STEP },
    ramp: RAMP,
    biggest: big?.id ?? null,
    quakes,
    pairs: outPairs,
    movement,
  };
  await fs.writeFile(path.join(OUT_DIR, '..', 'laguaira.json'), JSON.stringify(out));
  console.log(`Wrote public/data/laguaira.json (${outPairs.length} fringe pictures, ${Object.keys(movement).length} movement maps)`);
}
