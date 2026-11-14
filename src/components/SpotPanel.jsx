import { useEffect, useState } from 'react';
import { loadGrid, readSpot } from '../lib/radarGrid.js';
import { weatherAt } from '../lib/weatherMaps.js';
import { loadSpotNow } from '../api.js';

const KIND = {
  water: { icon: '💧', text: 'Open water', why: 'The radar echo bounced away, like light off a mirror.' },
  plants: { icon: '🌿', text: 'Plants', why: 'Leaves and branches scattered the radar in all directions.' },
  bright: { icon: '🏙️', text: 'Buildings or flooded trees', why: 'A very strong echo: radar bounced off the ground and then a wall or tree trunk.' },
};
const AQ = ['Good', 'Fair', 'Moderate', 'Poor', 'Very poor', 'Extremely poor'];
const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmt = (v, u) => (v === null || v === undefined ? '–' : `${Math.round(v * 10) / 10} ${u}`);

// Simple facts for any place someone clicks outside the three colored areas.
export default function SpotPanel({ spot, date, nisar, sat, wx, onClose }) {
  const [radar, setRadar] = useState(null);
  const [now, setNow] = useState({ state: 'loading' });
  const [nearFire, setNearFire] = useState(null);
  const base = nisar?.dates[0].date;

  useEffect(() => {
    if (!nisar) return;
    let alive = true;
    Promise.all([loadGrid(date), loadGrid(base)]).then(([cur, b]) => {
      if (alive) setRadar(readSpot(cur, b, nisar.classes, nisar.studyBounds, nisar.grid.step, spot.lon, spot.lat));
    });
    return () => { alive = false; };
  }, [spot, date, nisar, base]);

  useEffect(() => {
    let alive = true;
    setNow({ state: 'loading' });
    loadSpotNow(spot.lat, spot.lon)
      .then((r) => alive && setNow({ state: 'ok', v: r.values }))
      .catch(() => alive && setNow({ state: 'error' }));
    return () => { alive = false; };
  }, [spot]);

  // Any fire detection within ~5 km in the 12 days before this date?
  useEffect(() => {
    if (!sat) return;
    let alive = true;
    const img = new Image();
    img.src = `/data/sat/fires/${date}.png`;
    img.decode().then(() => {
      const sb = sat.studyBounds;
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ((spot.lon - sb.west) / (sb.east - sb.west)) * img.width;
      const py = ((sb.north - spot.lat) / (sb.north - sb.south)) * img.height;
      const r = Math.ceil((0.045 / (sb.east - sb.west)) * img.width);
      const x0 = Math.max(0, Math.floor(px - r)), y0 = Math.max(0, Math.floor(py - r));
      const { data } = ctx.getImageData(x0, y0, Math.min(2 * r, img.width - x0), Math.min(2 * r, img.height - y0));
      let found = false;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) { found = true; break; }
      if (alive) setNearFire(found);
    }).catch(() => alive && setNearFire(null));
    return () => { alive = false; };
  }, [spot, date, sat]);

  const kind = radar ? KIND[radar.kind] : null;
  const change = radar?.change;
  const changeText =
    change === null || change === undefined ? null
      : Math.abs(change) < 15 ? 'About the same as on the first pass.'
        : change < 0 ? 'Darker echo than on the first pass: maybe more water or fewer plants.'
          : 'Stronger echo than on the first pass: maybe wetter plants or new structures.';
  const rain = wx?.maps?.rain ? weatherAt(wx, 'rain', date, spot.lon, spot.lat) : null;
  const heat = wx?.maps?.heat ? weatherAt(wx, 'heat', date, spot.lon, spot.lat) : null;
  const pm = wx?.maps?.pm25 ? weatherAt(wx, 'pm25', date, spot.lon, spot.lat) : null;
  const v = now.v ?? {};
  const cur = (p) => v[p]?.[0]?.value;

  return (
    <div className="panel-body">
      <button className="back" onClick={onClose}>← All of South Florida</button>
      <h2 className="region-title"><span className="dot spot-dot" />This spot</h2>
      <p className="lead small-muted">{spot.lat.toFixed(3)}°N, {Math.abs(spot.lon).toFixed(3)}°W · NISAR pass of {fmtDate(date)}</p>

      <section className="fact">
        <h3>🛰️ What the radar sees</h3>
        {kind ? (
          <>
            <p className="big">{kind.icon} {kind.text}</p>
            <p className="small-muted">{kind.why}</p>
            {changeText && <p>{changeText}</p>}
          </>
        ) : <p className="small-muted">No radar data here.</p>}
      </section>

      <section className="fact">
        <h3>☁️ The 12 days before this pass</h3>
        <ul className="facts">
          <li><span>Rain</span><strong>{fmt(rain, 'mm')}</strong></li>
          <li><span>Afternoon highs</span><strong>{fmt(heat, '°C')}</strong></li>
          <li><span>Fine particles (PM2.5)</span><strong>{fmt(pm, 'µg/m³')}</strong></li>
          <li><span>Fires nearby (5 km)</span><strong>{nearFire === null ? '–' : nearFire ? '🔥 Yes' : 'None seen'}</strong></li>
        </ul>
      </section>

      <section className="fact">
        <h3>⏱️ Right now</h3>
        {now.state === 'loading' && <p className="small-muted">Loading…</p>}
        {now.state === 'error' && <p className="error">Live weather is not available. Is the server running (npm run dev)?</p>}
        {now.state === 'ok' && (
          <ul className="facts">
            <li><span>Temperature</span><strong>{fmt(cur('t_2m:C'), '°C')}</strong></li>
            <li><span>Humidity</span><strong>{fmt(cur('relative_humidity_2m:p'), '%')}</strong></li>
            <li><span>Air quality</span><strong>{cur('air_quality:idx') === undefined ? '–' : AQ[cur('air_quality:idx')]}</strong></li>
          </ul>
        )}
      </section>
      <p className="hint">Tip: click one of the colored areas for the full story of that place.</p>
    </div>
  );
}
