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
  const type = res.headers.get('content-type') ?? '';
  // A missing file can come back as the HTML page instead of an error; treat that as missing.
  if (!type.includes('json')) throw new Error(`Not found: ${url}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const loadNisar = () => cached('nisar', () => getJson('/data/nisar.json'));
export const loadLights = () => cached('lights', () => getJson('/data/lights.json'));
export const loadSeries = (region, layer, start, end) =>
  cached(`s:${region}:${layer}:${start}:${end}`, () => getJson(`/api/series/${region}/${layer}?start=${start}&end=${end}`));
export const loadNow = (region, layer) => cached(`n:${region}:${layer}`, () => getJson(`/api/now/${region}/${layer}`));
export const loadSatellites = () => cached('sat', () => getJson('/data/satellites.json'));
export const loadWeatherMaps = () => cached('wx', () => getJson('/data/weather-maps.json'));
export const loadSpotNow = (lat, lon) =>
  cached(`spot:${lat.toFixed(2)}:${lon.toFixed(2)}`, () => getJson(`/api/spot?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`));
// Is the weather server running with credentials?
export const checkWeatherServer = () =>
  fetch('/api/health')
    .then((r) => (r.ok ? r.json() : { ok: false }))
    .then((h) => (h.ok && h.meteomaticsConfigured ? 'ok' : h.ok ? 'no-credentials' : 'offline'))
    .catch(() => 'offline');
