// NASA Earthdata Login helper: exchanges username/password (from .env) for a bearer token.
import 'dotenv/config';

let cached = null;

export async function getEarthdataToken() {
  if (cached) return cached;
  const user = process.env.EARTHDATA_USERNAME;
  const pass = process.env.EARTHDATA_PASSWORD;
  if (!user || !pass) {
    throw new Error('Set EARTHDATA_USERNAME and EARTHDATA_PASSWORD in .env (see .env.example).');
  }
  const res = await fetch('https://urs.earthdata.nasa.gov/api/users/find_or_create_token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') },
  });
  if (!res.ok) throw new Error(`Earthdata Login failed: HTTP ${res.status}`);
  const body = await res.json();
  cached = body.access_token;
  return cached;
}

// Downloads a protected ASF/Earthdata file. ASF answers with a 303 redirect to a signed
// CloudFront URL, which must be fetched WITHOUT the Authorization header.
export async function downloadProtected(url) {
  const token = await getEarthdataToken();
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) res = await fetch(res.headers.get('location'));
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Same, but streams straight to a file (for multi-GB products). Writes to "<file>.part" first,
// so an interrupted download is never mistaken for a finished one.
export async function downloadProtectedToFile(url, file) {
  const { createWriteStream } = await import('node:fs');
  const { rename } = await import('node:fs/promises');
  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');
  const token = await getEarthdataToken();
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) res = await fetch(res.headers.get('location'));
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file + '.part'));
  await rename(file + '.part', file);
}
