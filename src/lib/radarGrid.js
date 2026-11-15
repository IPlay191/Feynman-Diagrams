// Reads the NISAR radar grids (public/data/nisar/grid/<date>.webp, lossless: R = HH, G = HV, B = has data)
// and turns them into map pictures: open water, plants, changes, and the readings for one spot.
const cache = new Map();

export function loadGrid(date) {
  if (!cache.has(date)) {
    cache.set(
      date,
      (async () => {
        const res = await fetch(`/data/nisar/grid/${date}.webp`);
        if (!res.ok) throw new Error(`Radar grid missing for ${date}`);
        // colorSpaceConversion 'none' keeps the exact pixel values
        const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0);
        const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
        const n = bmp.width * bmp.height;
        const hh = new Uint8Array(n), hv = new Uint8Array(n), valid = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          hh[i] = data[i * 4];
          hv[i] = data[i * 4 + 1];
          valid[i] = data[i * 4 + 2] > 127 ? 1 : 0;
        }
        return { date, width: bmp.width, height: bmp.height, hh, hv, valid };
      })().catch((e) => {
        cache.delete(date);
        throw e;
      }),
    );
  }
  return cache.get(date);
}

export function classify(hh, hv, c) {
  if (hh < c.waterMax && hv < c.waterMax) return 'water';
  if (hh >= c.brightHH && hv >= c.brightHV) return 'bright';
  return 'plants';
}

const toUrl = (img, w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(img, w, h), 0, 0);
  return canvas.toDataURL('image/png');
};

// Blue = open water. Bright cyan = water that was NOT there on the first pass (new water).
export function waterPicture(cur, base, c) {
  const img = new Uint8ClampedArray(cur.width * cur.height * 4);
  for (let i = 0; i < cur.hh.length; i++) {
    if (!cur.valid[i] || classify(cur.hh[i], cur.hv[i], c) !== 'water') continue;
    const wasWater = base.valid[i] && classify(base.hh[i], base.hv[i], c) === 'water';
    img.set(wasWater ? [37, 99, 235, 150] : [34, 211, 238, 235], i * 4);
  }
  return toUrl(img, cur.width, cur.height);
}

// Green = plants. Brown = plants on the first pass that no longer look like plants (lost).
export function plantsPicture(cur, base, c) {
  const img = new Uint8ClampedArray(cur.width * cur.height * 4);
  for (let i = 0; i < cur.hh.length; i++) {
    if (!cur.valid[i]) continue;
    const now = classify(cur.hh[i], cur.hv[i], c);
    const before = base.valid[i] ? classify(base.hh[i], base.hv[i], c) : null;
    if (now === 'plants') img.set([34, 197, 94, 110], i * 4);
    else if (before === 'plants') img.set([180, 83, 9, 230], i * 4);
  }
  return toUrl(img, cur.width, cur.height);
}

const echo = (g, i) => (g.hh[i] + g.hv[i]) / 2;

// Flat change map: orange = stronger radar echo than the first pass, blue = weaker.
export function changePicture(cur, base, c) {
  const img = new Uint8ClampedArray(cur.width * cur.height * 4);
  for (let i = 0; i < cur.hh.length; i++) {
    if (!cur.valid[i] || !base.valid[i]) continue;
    if (classify(cur.hh[i], cur.hv[i], c) === 'water' && classify(base.hh[i], base.hv[i], c) === 'water') continue;
    const d = echo(cur, i) - echo(base, i);
    if (Math.abs(d) < c.changeMin) continue;
    img.set(d > 0 ? [249, 115, 22, Math.min(255, 90 + Math.abs(d) * 2)] : [59, 130, 246, Math.min(255, 90 + Math.abs(d) * 2)], i * 4);
  }
  return toUrl(img, cur.width, cur.height);
}

// Reading for one spot, in plain words.
export function readSpot(cur, base, c, bounds, step, lon, lat) {
  const x = Math.floor((lon - bounds.west) / step);
  const y = Math.floor((bounds.north - lat) / step);
  if (x < 0 || y < 0 || x >= cur.width || y >= cur.height) return null;
  // average a 3x3 neighborhood (~600 m) so one noisy pixel does not decide
  const counts = { water: 0, plants: 0, bright: 0 };
  let dSum = 0, dn = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const i = (y + dy) * cur.width + (x + dx);
      if (i < 0 || i >= cur.hh.length || !cur.valid[i]) continue;
      counts[classify(cur.hh[i], cur.hv[i], c)]++;
      if (base.valid[i]) { dSum += echo(cur, i) - echo(base, i); dn++; }
    }
  const total = counts.water + counts.plants + counts.bright;
  if (!total) return null;
  const kind = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return { kind, change: dn ? dSum / dn : null };
}
