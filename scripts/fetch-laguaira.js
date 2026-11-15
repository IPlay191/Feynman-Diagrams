// "Other perspective": La Guaira, Venezuela. Downloads NISAR ground-movement maps (GUNW) and the
// USGS earthquake list, then crops everything to La Guaira.
//
//   npm run fetch:laguaira                    -> search ASF + USGS, download (cached in data/raw/laguaira), process
//   npm run fetch:laguaira -- --process-only  -> only re-run the processing step
//
// GUNW = "Geocoded Unwrapped Interferogram". NISAR compares two passes 12+ days apart; the phase
// difference of the radar waves tells how far the ground moved toward or away from the satellite.
import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadProtected, downloadProtectedToFile } from './lib/earthdata.js';
import { processLaGuaira, movementPairs, h5Dir } from './process-laguaira.js';

const RAW_DIR = path.resolve('data/raw/laguaira');
const POINT = 'POINT(-66.93 10.60)'; // La Guaira

const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function searchGunw() {
  const url =
    'https://api.daac.asf.alaska.edu/services/search/param?' +
    new URLSearchParams({ dataset: 'NISAR', processingLevel: 'GUNW', intersectsWith: POINT, output: 'geojson', maxResults: '500' });
  let res;
  for (let attempt = 1; ; attempt++) {
    try { res = await fetch(url); if (res.ok) break; } catch (e) { if (attempt >= 3) throw e; }
    if (attempt >= 3) throw new Error(`ASF search failed: HTTP ${res?.status}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt)); // the search API sometimes drops a request
  }
  const { features } = await res.json();
  // one product per track + date pair; prefer the normal ("_N_") production run, then the newest counter
  const best = new Map();
  for (const f of features) {
    const p = f.properties;
    const m = p.fileID.match(/_(\d{8})T(\d{6})_\d{8}T\d{6}_(\d{8})T(\d{6})_/);
    const browse = (p.browse || []).find((u) => u.endsWith('_LATLON.png'));
    if (!m || !browse) continue;
    const key = `${p.pathNumber}_${m[1]}_${m[3]}`;
    const score = (/_N_F_J_/.test(p.fileID) ? 100 : 0) + (Number(p.fileID.slice(-3)) || 0);
    if (!best.has(key) || score > best.get(key).score) {
      best.set(key, {
        key,
        score,
        track: p.pathNumber,
        direction: p.flightDirection,
        from: ymd(m[1]),
        to: ymd(m[3]),
        fromTime: `${ymd(m[1])}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}Z`,
        toTime: `${ymd(m[3])}T${m[4].slice(0, 2)}:${m[4].slice(2, 4)}:${m[4].slice(4, 6)}Z`,
        fileID: p.fileID,
        browse,
        h5: p.url,
        kml: p.url.replace(/[^/]+$/, `${p.fileID}_LATLON.kml`),
        qa: p.url.replace(/[^/]+$/, `${p.fileID}_QA_SUMMARY.csv`),
      });
    }
  }
  return [...best.values()].sort((a, b) => a.from.localeCompare(b.from) || a.track - b.track);
}

async function fetchQuakes() {
  // Every M2.5+ quake within 150 km since NISAR started observing (the map only shows La Guaira,
  // but the list keeps nearby quakes that shook it).
  const url =
    'https://earthquake.usgs.gov/fdsnws/event/1/query?' +
    new URLSearchParams({
      format: 'geojson',
      starttime: '2025-10-01',
      latitude: '10.6',
      longitude: '-66.93',
      maxradiuskm: '150',
      minmagnitude: '2.5',
      orderby: 'time-asc',
    });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS search failed: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  if (!process.argv.includes('--process-only')) {
    console.log('Searching ASF for NISAR GUNW over La Guaira ...');
    const pairs = await searchGunw();
    console.log(`  ${pairs.length} ground-movement maps`);
    for (const p of pairs) {
      const base = path.join(RAW_DIR, p.key);
      if (!(await exists(base + '.png'))) {
        process.stdout.write(`  downloading ${p.from} -> ${p.to} (track ${p.track}) ... `);
        await fs.writeFile(base + '.png', await downloadProtected(p.browse));
        console.log('ok');
      }
      if (!(await exists(base + '.kml'))) await fs.writeFile(base + '.kml', await downloadProtected(p.kml));
      if (!(await exists(base + '.csv'))) {
        try { await fs.writeFile(base + '.csv', await downloadProtected(p.qa)); } catch { /* optional */ }
      }
    }
    await fs.writeFile(path.join(RAW_DIR, 'pairs.json'), JSON.stringify(pairs, null, 2));

    console.log('Fetching the USGS earthquake list ...');
    const q = await fetchQuakes();
    console.log(`  ${q.features.length} earthquakes`);
    await fs.writeFile(path.join(RAW_DIR, 'quakes.geojson'), JSON.stringify(q));

    // Full products (~2.3 GB each) only for the passes around the biggest quake. They go to a
    // local temp folder (LAGUAIRA_H5_DIR), not the project, so cloud-synced folders stay small.
    const big = q.features.reduce((m, f) => (!m || f.properties.mag > m.properties.mag ? f : m), null);
    if (big) {
      // USGS details for the biggest quake: how the fault moved (moment tensor) and how much it slipped
      const res = await fetch(big.properties.detail);
      if (res.ok) {
        const pr = (await res.json()).properties.products;
        const mt = pr['moment-tensor']?.[0]?.properties ?? {};
        const ff = pr['finite-fault']?.[0]?.properties ?? {};
        await fs.writeFile(path.join(RAW_DIR, 'quake-detail.json'), JSON.stringify({
          id: big.id,
          planes: [1, 2].map((n) => ({ strike: +mt[`nodal-plane-${n}-strike`], dip: +mt[`nodal-plane-${n}-dip`], rake: +mt[`nodal-plane-${n}-rake`] })),
          maxSlipM: ff['maximum-slip'] ? +ff['maximum-slip'] : null,
          faultLengthKm: ff['model-length'] ? +ff['model-length'] : null,
        }, null, 2));
      }
      const pick = movementPairs(pairs, new Date(big.properties.time).toISOString());
      const dir = h5Dir();
      await fs.mkdir(dir, { recursive: true });
      for (const p of [...Object.values(pick.during), ...Object.values(pick.before)]) {
        const file = path.join(dir, `${p.key}.h5`);
        if (await exists(file)) continue;
        process.stdout.write(`  downloading full product ${p.key}.h5 (~2.3 GB) ... `);
        await downloadProtectedToFile(p.h5, file);
        console.log('ok');
      }
    }
  }
  await processLaGuaira(RAW_DIR);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
