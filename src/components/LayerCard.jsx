import { useEffect, useState } from 'react';
import Sparkline from './Sparkline.jsx';
import { loadNow, loadSeries } from '../api.js';
import { INSIGHTS } from '../data/insights.js';
import { weatherMean } from '../lib/weatherMaps.js';

// When live weather is not available, these saved Meteomatics maps stand in for the live numbers.
const SAVED = { 'precip_24h:mm': 'rain', 'evapotranspiration_24h:mm': 'plants', 't_max_2m_24h:C': 'heat', 'pm2p5:ugm3': 'pm25' };

const fmt = (v, digits = 1) => (v === null || v === undefined ? '–' : Number(v).toFixed(digits).replace(/\.0$/, ''));
const AQ_WORDS = ['Good', 'Fair', 'Moderate', 'Poor', 'Very poor', 'Extremely poor'];
const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function useWeather(region, layer, range) {
  const [state, setState] = useState({ series: null, now: null, error: null });
  useEffect(() => {
    if (!layer.meteomatics.length || !range) {
      setState({ series: null, now: null, error: null });
      return;
    }
    let alive = true;
    setState({ series: null, now: null, error: null });
    Promise.all([loadSeries(region.id, layer.id, range.start, range.end), loadNow(region.id, layer.id)])
      .then(([s, n]) => alive && setState({ series: s.series, now: n.values, error: null }))
      .catch((e) => alive && setState({ series: null, now: null, error: e.message }));
    return () => { alive = false; };
  }, [region.id, layer.id, layer.meteomatics.length, range?.start, range?.end]);
  return state;
}

function valueText(param, v, unit) {
  if (v === null || v === undefined) return '–';
  if (param === 'air_quality:idx') return `${v} · ${AQ_WORDS[v] ?? ''}`;
  return `${fmt(v, param.endsWith(':idx') ? 2 : 1)}${unit ? ' ' + unit : ''}`;
}

function SavedWeather({ region, layer, date, nisar, wx }) {
  const ids = [...new Set(layer.meteomatics.map((m) => SAVED[m.param]).filter((id) => id && wx?.maps?.[id]))];
  if (!ids.length) return null;
  return (
    <section className="weather">
      <h4>☁️ Weather in the 12 days before this pass <small>(Meteomatics)</small></h4>
      {ids.map((id) => {
        const m = wx.maps[id];
        const pts = nisar.dates.map((d) => ({ x: Date.parse(d.date), y: weatherMean(wx, id, d.date, region.polygon) }));
        const v = pts.find((p) => p.x === Date.parse(date))?.y;
        return (
          <div className="wx-row" key={id}>
            <div className="wx-top">
              <span>{m.label}</span>
              <strong>{v === null || v === undefined ? '–' : `${fmt(v)} ${m.unit}`}</strong>
            </div>
            <Sparkline points={pts} marker={Date.parse(date)} color="#94a3b8" height={30} label={m.label} />
          </div>
        );
      })}
    </section>
  );
}

export default function LayerCard({ region, layer, date, nisar, lights, sat, wx, liveWeather }) {
  const [open, setOpen] = useState(false);
  const range = nisar && liveWeather ? { start: nisar.dates[0].date, end: nisar.dates.at(-1).date } : null;
  const weather = useWeather(region, layer, range);
  const insight = INSIGHTS[region.id]?.[layer.id];

  // NISAR radar indicator for this region
  const rows = nisar?.regions[region.id] ?? [];
  const key = layer.nisar.key;
  const cur = rows.find((r) => r.date === date);
  const first = rows[0];
  const delta = cur && first && cur[key] != null && first[key] != null ? cur[key] - first[key] : null;
  const radarPts = rows.map((r) => ({ x: Date.parse(r.date), y: r[key] }));

  const lightRow = lights?.regions[region.id];
  const lightNow = lightRow?.daily.find((d) => d.date === date)?.value;

  return (
    <article className="card" style={{ '--accent': layer.color }}>
      <header className="card-head">
        <span className="card-icon" aria-hidden>{layer.icon}</span>
        <h3>{layer.label}</h3>
      </header>
      <p className="simple">{layer.simple}</p>

      <section className="metric">
        <div className="metric-top">
          <span className="metric-label">🛰️ NISAR radar: {layer.nisar.label}</span>
          <span className="metric-value">{fmt(cur?.[key])}%</span>
        </div>
        <Sparkline points={radarPts} marker={Date.parse(date)} color={layer.color} yMin={0} label={`${layer.nisar.label} over time`} />
        <div className="metric-foot">
          <span>{first && fmtDate(first.date)}</span>
          {delta !== null && (
            <span className={`delta ${Math.abs(delta) < 1 ? '' : delta > 0 ? 'up' : 'down'}`}>
              {Math.abs(delta) < 1 ? 'about the same as' : `${delta > 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))} points vs.`} the first pass
            </span>
          )}
          <span>{rows.at(-1) && fmtDate(rows.at(-1).date)}</span>
        </div>
      </section>

      {layer.id === 'fires' && sat && (
        <section className="metric">
          <div className="metric-top">
            <span className="metric-label">🔥 VIIRS satellites: fire spots in the 12 days before</span>
            <span className="metric-value">{sat.dates[date]?.fires[region.id] ?? '–'}</span>
          </div>
          <Sparkline
            points={nisar.dates.map((d) => ({ x: Date.parse(d.date), y: sat.dates[d.date]?.fires[region.id] ?? null }))}
            marker={Date.parse(date)}
            color={layer.color}
            yMin={0}
            label="Fire spots over time"
          />
          <div className="metric-foot"><span>Shown as red dots on the map</span></div>
        </section>
      )}

      {layer.blackMarble && lightRow && (
        <section className="metric">
          <div className="metric-top">
            <span className="metric-label">🌃 Black Marble night brightness (0-100)</span>
            <span className="metric-value">{fmt(lightNow)}</span>
          </div>
          <div className="bars">
            {[...lightRow.annual, { date: 'Now', value: lightNow }].map((b) => (
              <div className="bar" key={b.date}>
                <div className="bar-fill" style={{ height: `${Math.max(3, b.value ?? 0)}%`, background: layer.color }} />
                <span className="bar-val">{fmt(b.value, 0)}</span>
                <span className="bar-label">{b.date}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* no live weather (or it failed): show the saved weather instead of an error */}
      {layer.meteomatics.length > 0 && (!liveWeather || weather.error) && (
        <SavedWeather region={region} layer={layer} date={date} nisar={nisar} wx={wx} />
      )}

      {layer.meteomatics.length > 0 && liveWeather && !weather.error && (
        <section className="weather">
          <h4>☁️ Weather & air on this date <small>(Meteomatics)</small></h4>
          {!weather.series && <p className="loading">Loading…</p>}
          {weather.series &&
            layer.meteomatics.map((m) => {
              const s = weather.series[m.param] ?? [];
              const onDate = s.find((x) => x.date.startsWith(date))?.value;
              const now = weather.now?.[m.param]?.[0]?.value;
              return (
                <div className="wx-row" key={m.param}>
                  <div className="wx-top">
                    <span>{m.label}</span>
                    <strong>{valueText(m.param, onDate, m.unit)}</strong>
                  </div>
                  <Sparkline points={s.map((x) => ({ x: Date.parse(x.date), y: x.value }))} marker={Date.parse(date + 'T12:00:00Z')} color="#94a3b8" height={30} label={m.label} />
                  <div className="wx-now">Right now: {valueText(m.param, now, m.unit)}</div>
                </div>
              );
            })}
        </section>
      )}

      {insight && (
        <section className="insight">
          <p><strong>What we saw:</strong> {insight.saw}</p>
          <p><strong>Why we think it happens:</strong> {insight.why}</p>
        </section>
      )}

      <button className="more" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} How does radar see this?
      </button>
      {open && <p className="radar-how">{layer.radarHow}</p>}
    </article>
  );
}
