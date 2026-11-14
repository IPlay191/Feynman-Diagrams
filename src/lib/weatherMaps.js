// Turns the Meteomatics weather grids (public/data/weather-maps.json) into soft colored map layers.
import { pointInPolygon } from '../../shared/regions.js';

// [value 0..1 -> rgba] color ramps, transparent at the low end so the map shows through
const RAMPS = {
  rain: [[0, [59, 130, 246, 0]], [0.25, [59, 130, 246, 70]], [0.6, [99, 102, 241, 140]], [1, [168, 85, 247, 190]]],
  plants: [[0, [132, 204, 22, 0]], [0.4, [132, 204, 22, 60]], [1, [22, 163, 74, 160]]],
  heat: [[0, [250, 204, 21, 0]], [0.35, [250, 204, 21, 60]], [0.7, [249, 115, 22, 130]], [1, [220, 38, 38, 180]]],
  pm25: [[0, [167, 139, 250, 0]], [0.3, [167, 139, 250, 60]], [1, [139, 92, 246, 190]]],
};
export const RAMP_CSS = {
  rain: 'linear-gradient(90deg, rgba(59,130,246,0.1), rgb(99,102,241), rgb(168,85,247))',
  plants: 'linear-gradient(90deg, rgba(132,204,22,0.1), rgb(132,204,22), rgb(22,163,74))',
  heat: 'linear-gradient(90deg, rgba(250,204,21,0.1), rgb(249,115,22), rgb(220,38,38))',
  pm25: 'linear-gradient(90deg, rgba(167,139,250,0.1), rgb(167,139,250), rgb(139,92,246))',
};

function color(ramp, t) {
  for (let i = 1; i < ramp.length; i++) {
    if (t <= ramp[i][0]) {
      const [t0, c0] = ramp[i - 1];
      const [t1, c1] = ramp[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
    }
  }
  return ramp.at(-1)[1];
}

const pictureCache = new Map();

// One small picture per map and date; the map smooths it when stretching (soft weather look).
export function weatherPicture(wx, id, date) {
  const key = `${id}:${date}`;
  if (pictureCache.has(key)) return pictureCache.get(key);
  const m = wx.maps[id];
  const vals = m.values[date];
  if (!vals) return null;
  const w = m.lons.length, h = m.lats.length;
  const img = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === null) continue;
    const t = Math.max(0, Math.min(1, (vals[i] - m.min) / (m.max - m.min || 1)));
    img.set(color(RAMPS[id], t), i * 4);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(img, w, h), 0, 0);
  const pic = {
    url: canvas.toDataURL('image/png'),
    // grid values are cell centers; stretch the picture half a cell outward
    corners: [
      [m.lons[0] - wx.res / 2, m.lats[0] + wx.res / 2],
      [m.lons.at(-1) + wx.res / 2, m.lats[0] + wx.res / 2],
      [m.lons.at(-1) + wx.res / 2, m.lats.at(-1) - wx.res / 2],
      [m.lons[0] - wx.res / 2, m.lats.at(-1) - wx.res / 2],
    ],
  };
  pictureCache.set(key, pic);
  return pic;
}

// Value at the grid point closest to (lon, lat)
export function weatherAt(wx, id, date, lon, lat) {
  const m = wx.maps[id];
  const vals = m?.values[date];
  if (!vals) return null;
  const yi = Math.round((m.lats[0] - lat) / wx.res);
  const xi = Math.round((lon - m.lons[0]) / wx.res);
  if (yi < 0 || xi < 0 || yi >= m.lats.length || xi >= m.lons.length) return null;
  return vals[yi * m.lons.length + xi];
}

// Average value over a region polygon
export function weatherMean(wx, id, date, polygon) {
  const m = wx.maps[id];
  const vals = m?.values[date];
  if (!vals) return null;
  let sum = 0, n = 0;
  for (let y = 0; y < m.lats.length; y++)
    for (let x = 0; x < m.lons.length; x++) {
      const v = vals[y * m.lons.length + x];
      if (v === null || (polygon && !pointInPolygon([m.lons[x], m.lats[y]], polygon))) continue;
      sum += v;
      n++;
    }
  if (!n && polygon) {
    // small regions may fall between grid points: use the nearest point to the center
    const cx = polygon.reduce((a, p) => a + p[0], 0) / polygon.length;
    const cy = polygon.reduce((a, p) => a + p[1], 0) / polygon.length;
    return weatherAt(wx, id, date, cx, cy);
  }
  return n ? sum / n : null;
}
