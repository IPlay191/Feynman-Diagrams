// Browser-side data access. Weather goes through our own /api proxy (the password stays on the
// server). NISAR and Black Marble numbers are pre-computed JSON files in /public/data.
const cache = new Map();

function cached(key, fn) {
  if (!cache.has(key)) {
    const p = fn().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return cache.get(key);
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const loadNisar = () => cached('nisar', () => getJson('/data/nisar.json'));
export const loadLights = () => cached('lights', () => getJson('/data/lights.json'));
export const loadSeries = (region, layer, start, end) =>
  cached(`s:${region}:${layer}:${start}:${end}`, () => getJson(`/api/series/${region}/${layer}?start=${start}&end=${end}`));
export const loadNow = (region, layer) => cached(`n:${region}:${layer}`, () => getJson(`/api/now/${region}/${layer}`));
