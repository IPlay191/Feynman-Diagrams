// Dancing with SARs: API proxy + static file server.
// The website never sees the Meteomatics password; it calls these /api routes instead.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { REGIONS, SOUTH_FL_BOUNDS, inBounds } from '../shared/regions.js';
import { LAYERS, ALLOWED_PARAMS } from '../shared/layers.js';
import { getNow, getDailySeries } from './meteomatics.js';

const app = express();
app.disable('x-powered-by');
const PORT = Number(process.env.PORT) || 8787;

// What we show "right now" for any spot someone clicks on the map
const SPOT_PARAMS = ['t_2m:C', 'precip_24h:mm', 'relative_humidity_2m:p', 'air_quality:idx'];

// Small per-IP rate limit so a public deployment cannot burn through the API quota.
const hits = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now();
  const entry = hits.get(req.ip) ?? { count: 0, reset: now + 60_000 };
  if (now > entry.reset) Object.assign(entry, { count: 0, reset: now + 60_000 });
  entry.count += 1;
  hits.set(req.ip, entry);
  if (entry.count > 120) return res.status(429).json({ error: 'Too many requests, please slow down.' });
  next();
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

function region(req, res) {
  const r = REGIONS[req.params.region];
  if (!r) res.status(404).json({ error: 'Unknown region' });
  return r;
}

function paramsFor(req, res) {
  const layer = LAYERS[req.params.layer];
  if (!layer) {
    res.status(404).json({ error: 'Unknown layer' });
    return null;
  }
  return layer.meteomatics.map((m) => m.param).filter((p) => ALLOWED_PARAMS.includes(p));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, meteomaticsConfigured: Boolean(process.env.METEOMATICS_USERNAME && process.env.METEOMATICS_PASSWORD) });
});

// Current conditions for one region and one layer.
app.get('/api/now/:region/:layer', async (req, res, next) => {
  const r = region(req, res);
  if (!r) return;
  const params = paramsFor(req, res);
  if (!params) return;
  if (params.length === 0) return res.json({ region: r.id, layer: req.params.layer, values: {} });
  try {
    res.json({ region: r.id, layer: req.params.layer, values: await getNow(params, r.point) });
  } catch (e) { next(e); }
});

// Current conditions at any spot in South Florida: /api/spot?lat=25.6&lon=-80.7
app.get('/api/spot', async (req, res, next) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBounds(SOUTH_FL_BOUNDS, lon, lat)) {
    return res.status(400).json({ error: 'lat/lon must be inside South Florida' });
  }
  // round to ~1 km so nearby clicks share the cache
  const point = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
  try {
    res.json({ point, values: await getNow(SPOT_PARAMS, point) });
  } catch (e) { next(e); }
});

// Daily time series for one region and one layer: /api/series/everglades/flooding?start=2025-11-25&end=2026-10-27
app.get('/api/series/:region/:layer', async (req, res, next) => {
  const r = region(req, res);
  if (!r) return;
  const params = paramsFor(req, res);
  if (!params) return;
  const { start, end } = req.query;
  if (!DATE_RE.test(start ?? '') || !DATE_RE.test(end ?? '')) {
    return res.status(400).json({ error: 'start and end must be YYYY-MM-DD' });
  }
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  if (!(days >= 0 && days <= MAX_DAYS)) {
    return res.status(400).json({ error: `Date range must be between 0 and ${MAX_DAYS} days` });
  }
  if (params.length === 0) return res.json({ region: r.id, layer: req.params.layer, series: {} });
  try {
    res.json({ region: r.id, layer: req.params.layer, series: await getDailySeries(params, r.point, start, end) });
  } catch (e) { next(e); }
});

// In production, serve the built website from dist/.
const dist = path.resolve('dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), (err) => err && next()));

// Errors: log the message on the server, send a generic message to the browser.
app.use((err, _req, res, _next) => {
  console.error('[api]', err.message);
  res.status(err.status || 500).json({ error: 'Weather data is unavailable right now.' });
});

const server = app.listen(PORT, (err) => {
  if (!err) console.log(`API ready on http://localhost:${PORT}`);
});
// Make a busy port impossible to miss (otherwise the weather silently stops working).
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use: another copy of this server is still running.\n  Close the other terminal running "npm run dev" (or set PORT in .env), then try again.\n`);
  } else console.error('[api] could not start:', e.message);
  process.exit(1);
});
