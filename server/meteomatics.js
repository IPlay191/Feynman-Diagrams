// Thin Meteomatics client. Credentials come from .env and never leave the server.
// Docs: https://www.meteomatics.com/en/api/getting-started/
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = 'https://api.meteomatics.com';
const CACHE_DIR = path.resolve('.cache/meteomatics');
const memory = new Map(); // url -> { expires, data }

function authHeader() {
  const user = process.env.METEOMATICS_USERNAME;
  const pass = process.env.METEOMATICS_PASSWORD;
  if (!user || !pass) throw new Error('Meteomatics credentials missing: set METEOMATICS_USERNAME and METEOMATICS_PASSWORD in .env');
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

// Past data never changes, so it is cached on disk forever. "Now" data is cached 15 minutes.
async function cachedFetch(url, ttlMs) {
  const hit = memory.get(url);
  if (hit && hit.expires > Date.now()) return hit.data;

  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (ttlMs === Infinity) {
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      memory.set(url, { expires: Infinity, data });
      return data;
    } catch { /* not cached yet */ }
  }

  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) {
    const err = new Error(`Meteomatics responded with HTTP ${res.status}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  const data = await res.json();
  memory.set(url, { expires: Date.now() + ttlMs, data });
  if (ttlMs === Infinity) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data));
  }
  return data;
}

// Turns the Meteomatics JSON into { param: [{ date, value }] }.
function simplify(json) {
  const out = {};
  for (const d of json.data) {
    out[d.parameter] = d.coordinates[0].dates.map((x) => ({
      date: x.date,
      // Meteomatics uses -666 / -999 as "no data"
      value: x.value === null || x.value <= -666 ? null : x.value,
    }));
  }
  return out;
}

export async function getNow(params, { lat, lon }) {
  const url = `${BASE}/now/${params.join(',')}/${lat},${lon}/json`;
  return simplify(await cachedFetch(url, 15 * 60 * 1000));
}

// Daily values at 12:00 UTC (07:00 Miami time) between two dates.
export async function getDailySeries(params, { lat, lon }, start, end) {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${BASE}/${start}T12:00:00Z--${end}T12:00:00Z:P1D/${params.join(',')}/${lat},${lon}/json`;
  // Ranges that reach today or later can still change, so cache them only for an hour.
  return simplify(await cachedFetch(url, end >= today ? 60 * 60 * 1000 : Infinity));
}
