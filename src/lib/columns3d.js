// 3D columns for every checkbox. Each function returns
//   { cells: [{ position }], values: Float32Array, extra?: Float32Array, size: meters }
// The list of cells stays the same for every date (only the values change), so deck.gl can
// smoothly grow and shrink the columns while the timeline plays, without rebuilding geometry.
import { pointInPolygon, regionBBox } from '../../shared/regions.js';
import { loadGrid, classify } from './radarGrid.js';

const M_PER_DEG = 111_320;
const cache = new Map();
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, Promise.resolve().then(fn).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
};

// Square size (in radar pixels of ~200 m): 1 km over big areas, 200 m for the small city areas.
export const cellSizeFor = (regionId) => (regionId === 'downtown' || regionId === 'miamibeach' ? 1 : 5);

function inRegion(polygon, bbox, lon, lat) {
  if (!polygon) return true;
  if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) return false;
  return pointInPolygon([lon, lat], polygon);
}

// ---------------- radar-based (Flooding, Deforestation, What changed) ----------------

// Squares that were land on the first pass (sea squares never get columns).
function radarCells(base, classes, nisar, size, regionId, polygon) {
  return memo(`cells:${size}:${regionId ?? 'all'}`, () => {
    const { width, height } = base;
    const { west, north } = nisar.studyBounds;
    const step = nisar.grid.step;
    const bbox = regionId ? regionBBox(regionId) : null;
    const cells = [];
    for (let by = 0; by < height; by += size) {
      for (let bx = 0; bx < width; bx += size) {
        const lon = west + (bx + size / 2) * step;
        const lat = north - (by + size / 2) * step;
        if (!inRegion(polygon, bbox, lon, lat)) continue;
        let land = 0;
        for (let y = by; y < Math.min(by + size, height); y++)
          for (let x = bx; x < Math.min(bx + size, width); x++) {
            const i = y * width + x;
            if (base.valid[i] && classify(base.hh[i], base.hv[i], classes) !== 'water') land++;
          }
        // small areas: keep every square that has any data, so the city is fully covered
        if (size === 1 ? !base.valid[by * width + bx] : land < (size * size) / 3) continue;
        cells.push({ bx, by, position: [lon, lat] });
      }
    }
    return cells;
  });
}

// Runs `fn(i, cur, base)` over every radar pixel of every square and stores one number per square.
function perCell(cells, size, cur, base, fn) {
  const values = new Float32Array(cells.length);
  const { width, height } = cur;
  cells.forEach((c, k) => {
    let sum = 0, n = 0;
    for (let y = c.by; y < Math.min(c.by + size, height); y++)
      for (let x = c.bx; x < Math.min(c.bx + size, width); x++) {
        const i = y * width + x;
        if (!cur.valid[i] || !base.valid[i]) continue;
        sum += fn(i);
        n++;
      }
    values[k] = n ? sum / n : 0;
  });
  return values;
}

export async function radarColumns(kind, date, nisar, regionId, polygon) {
  const size = cellSizeFor(regionId);
  const baseDate = nisar.dates[0].date;
  const c = nisar.classes;
  return memo(`radar:${kind}:${date}:${regionId ?? 'all'}`, async () => {
    const [cur, base] = await Promise.all([loadGrid(date), loadGrid(baseDate)]);
    const cells = await radarCells(base, c, nisar, size, regionId, polygon);
    const isWater = (g, i) => classify(g.hh[i], g.hv[i], c) === 'water';
    const isPlant = (g, i) => classify(g.hh[i], g.hv[i], c) === 'plants';
    const out = { cells, size: size * nisar.grid.step * M_PER_DEG * Math.cos((25.6 * Math.PI) / 180) };
    if (kind === 'water') {
      // share of the square covered by NEW water (water now, land on the first pass)
      out.values = perCell(cells, size, cur, base, (i) => (isWater(cur, i) && !isWater(base, i) ? 1 : 0));
    } else if (kind === 'plants') {
      out.values = perCell(cells, size, cur, base, (i) => (isPlant(cur, i) ? 1 : 0)); // plants now
      out.extra = perCell(cells, size, cur, base, (i) => (isPlant(base, i) && !isPlant(cur, i) ? 1 : 0)); // plants lost
    } else {
      // change in radar echo (average of HH and HV, 0-255 scale) vs. the first pass
      out.values = perCell(cells, size, cur, base, (i) => (cur.hh[i] + cur.hv[i]) / 2 - (base.hh[i] + base.hv[i]) / 2);
    }
    return out;
  });
}

// ---------------- picture-based (Fires, Light Pollution) ----------------

const pixelCache = new Map();
export function imagePixels(url) {
  if (!pixelCache.has(url)) {
    pixelCache.set(url, (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return { data: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height };
    })().catch((e) => { pixelCache.delete(url); throw e; }));
  }
  return pixelCache.get(url);
}

// Groups picture pixels into squares of `px` pixels and averages `fn(r,g,b,a)` per square.
function pictureGrid({ data, width, height }, bounds, px, regionId, polygon, fn, keep) {
  const bbox = regionId ? regionBBox(regionId) : null;
  const dLon = (bounds.east - bounds.west) / width;
  const dLat = (bounds.north - bounds.south) / height;
  const cells = [];
  const values = [];
  for (let by = 0; by < height; by += px)
    for (let bx = 0; bx < width; bx += px) {
      const lon = bounds.west + (bx + px / 2) * dLon;
      const lat = bounds.north - (by + px / 2) * dLat;
      if (!inRegion(polygon, bbox, lon, lat)) continue;
      let sum = 0, n = 0;
      for (let y = by; y < Math.min(by + px, height); y++)
        for (let x = bx; x < Math.min(bx + px, width); x++) {
          const i = (y * width + x) * 4;
          sum += fn(data[i], data[i + 1], data[i + 2], data[i + 3]);
          n++;
        }
      const v = n ? sum / n : 0;
      if (keep(v)) { cells.push({ position: [lon, lat], bx, by }); values.push(v); }
    }
  return { cells, values: Float32Array.from(values), size: px * dLon * M_PER_DEG * Math.cos((25.6 * Math.PI) / 180) };
}

// Fires: a column wherever the VIIRS satellites saw a fire (cells change from date to date).
export function fireColumns(date, sat, regionId, polygon) {
  return memo(`fires:${date}:${regionId ?? 'all'}`, async () => {
    const pix = await imagePixels(`/data/sat/fires/${date}.png`);
    // ~0.5 km squares in small areas, ~1 km elsewhere
    const px = regionId === 'downtown' || regionId === 'miamibeach' ? 4 : 9;
    return pictureGrid(pix, sat.studyBounds, px, regionId, polygon, (r, g, b, a) => (a > 0 ? 1 : 0), (v) => v > 0);
  });
}

// Night lights: the list of squares comes from the first date (stable), the brightness from `date`.
export function lightColumns(date, nisar, sat, regionId, polygon) {
  const first = nisar.dates[0].date;
  const px = regionId === 'downtown' || regionId === 'miamibeach' ? 2 : 4;
  const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return memo(`lights:${date}:${regionId ?? 'all'}`, async () => {
    const stable = await memo(`lights-cells:${regionId ?? 'all'}`, async () =>
      pictureGrid(await imagePixels(`/data/sat/lights/${first}.webp`), sat.studyBounds, px, regionId, polygon, lum, (v) => v > 0.15));
    const cur = await imagePixels(`/data/sat/lights/${date}.webp`);
    const { width, height, data } = cur;
    const values = new Float32Array(stable.cells.length);
    stable.cells.forEach((c, k) => {
      let sum = 0, n = 0;
      for (let y = c.by; y < Math.min(c.by + px, height); y++)
        for (let x = c.bx; x < Math.min(c.bx + px, width); x++) {
          const i = (y * width + x) * 4;
          sum += lum(data[i], data[i + 1], data[i + 2]);
          n++;
        }
      values[k] = n ? sum / n : 0;
    });
    return { cells: stable.cells, values, size: stable.size };
  });
}

// ---------------- weather (Pollution / Smog) ----------------

// PM2.5 columns at the Meteomatics grid points (~4 km apart). In a small area with no grid
// point inside, the closest grid point is used.
export function weatherColumns(wx, id, date, regionId, polygon) {
  return memo(`wx:${id}:${date}:${regionId ?? 'all'}`, async () => {
    const m = wx.maps[id];
    const bbox = regionId ? regionBBox(regionId) : null;
    let idx = [];
    let center = null;
    for (let y = 0; y < m.lats.length; y++)
      for (let x = 0; x < m.lons.length; x++)
        if (inRegion(polygon, bbox, m.lons[x], m.lats[y])) idx.push([x, y]);
    if (!idx.length && polygon) {
      const cx = polygon.reduce((a, p) => a + p[0], 0) / polygon.length;
      const cy = polygon.reduce((a, p) => a + p[1], 0) / polygon.length;
      center = [cx, cy]; // draw the closest weather square's value in the middle of the area
      idx = [[Math.round((cx - m.lons[0]) / wx.res), Math.round((m.lats[0] - cy) / wx.res)]];
    }
    const vals = m.values[date] ?? [];
    const cells = idx.map(([x, y]) => ({ position: center ?? [m.lons[x], m.lats[y]] }));
    const values = Float32Array.from(idx.map(([x, y]) => {
      const v = vals[y * m.lons.length + x];
      return v === null || v === undefined ? 0 : (v - m.min) / (m.max - m.min || 1);
    }));
    let size = wx.res * M_PER_DEG * Math.cos((25.6 * Math.PI) / 180);
    // a small area can be narrower than one weather square: keep the column inside the area
    if (bbox) size = Math.min(size, 0.35 * (bbox[2] - bbox[0]) * M_PER_DEG * Math.cos((25.6 * Math.PI) / 180));
    return { cells, values, size };
  });
}
