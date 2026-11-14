import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView.jsx';
import SidePanel from './components/SidePanel.jsx';
import Timeline from './components/Timeline.jsx';
import LayerBar from './components/LayerBar.jsx';
import SourcesPanel from './components/SourcesPanel.jsx';
import { REGIONS } from '../shared/regions.js';
import { LAYERS } from '../shared/layers.js';
import { checkWeatherServer, loadLights, loadNisar, loadSatellites, loadWeatherMaps } from './api.js';
import { RAMP_CSS, weatherMean } from './lib/weatherMaps.js';
import { Sonifier } from './lib/sound.js';

const rgb = (c) => `rgb(${c.join(',')})`;
const fmtShort = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Weak devices (few CPU cores or little memory) start in Low Quality Mode.
function initialLowQuality() {
  const saved = localStorage.getItem('lowQuality');
  if (saved !== null) return saved === '1';
  return (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || false;
}

export default function App() {
  const [nisar, setNisar] = useState(null);
  const [lights, setLights] = useState(null);
  const [sat, setSat] = useState(null);
  const [wx, setWx] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [server, setServer] = useState('checking');
  const [selected, setSelected] = useState(null);
  const [spot, setSpot] = useState(null);
  const [mode, setMode] = useState('3d');
  const [view, setView] = useState('radar'); // 'radar' | 'change' | 'photo' | 'plain'
  const [active, setActive] = useState(() => new Set(['flooding']));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [lowQuality, setLowQuality] = useState(initialLowQuality);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sound = useRef(null);

  useEffect(() => {
    loadNisar()
      .then((n) => { setNisar(n); setIndex(n.dates.length - 1); })
      .catch(() => setLoadError('NISAR data not found. Run "npm run fetch:nisar" first.'));
    loadLights().then(setLights).catch(() => {});
    loadSatellites().then(setSat).catch(() => {});
    loadWeatherMaps().then(setWx).catch(() => {});
    checkWeatherServer().then(setServer);
  }, []);

  useEffect(() => localStorage.setItem('lowQuality', lowQuality ? '1' : '0'), [lowQuality]);
  const effectiveMode = lowQuality ? '2d' : mode;

  const dates = useMemo(() => nisar?.dates.map((d) => d.date) ?? [], [nisar]);
  const date = dates[index] ?? '2026-10-27';

  const toggle = useCallback((id) => {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const select = useCallback((id) => { setSpot(null); setSelected(id); }, []);
  const pickSpot = useCallback((s) => { setSelected(null); setSpot(s); }, []);

  // ---- sonification: one note per NISAR pass ----
  const onStep = useCallback(
    (i) => {
      if (!soundOn || !sound.current || !nisar) return;
      const d = dates[i];
      const regionId = selected ?? 'everglades';
      const firstRadar = [...active].map((id) => LAYERS[id].nisar.key)[0] ?? 'water';
      const rows = nisar.regions[regionId];
      const vals = rows.map((r) => r[firstRadar]).filter((v) => v !== null);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const v = rows[i]?.[firstRadar];
      const poly = REGIONS[regionId].polygon;
      const norm = (id) => {
        if (!wx?.maps?.[id]) return 0;
        const m = wx.maps[id];
        const x = weatherMean(wx, id, d, poly);
        return x === null ? 0 : (x - m.min) / (m.max - m.min || 1);
      };
      sound.current.step({ value: hi > lo ? (v - lo) / (hi - lo) : 0.5, rain: norm('rain'), air: norm('pm25') }, (lowQuality ? 2000 : 1400) / 1000);
    },
    [soundOn, nisar, dates, selected, active, wx, lowQuality],
  );

  const onPlay = () => {
    if (!playing && soundOn) {
      sound.current ??= new Sonifier();
      sound.current.start();
    }
    setPlaying((p) => !p);
  };
  const onSound = () => {
    if (!soundOn && playing) {
      sound.current ??= new Sonifier();
      sound.current.start();
    }
    setSoundOn((s) => !s);
  };

  // ---- legend ----
  const legendItems = [];
  for (const id of active) {
    const m = LAYERS[id].map;
    if (m.radar === 'water') legendItems.push({ sw: '#2563eb', t: 'Open water (NISAR)' }, { sw: '#22d3ee', t: `New water since ${fmtShort(dates[0] ?? date)}` });
    if (m.radar === 'plants') legendItems.push({ sw: '#22c55e', t: 'Plants (NISAR)' }, { sw: '#b45309', t: 'Plants lost since first pass' });
    if (m.sat === 'fires') legendItems.push({ sw: '#ff4500', t: 'Fire spotted (VIIRS, 12 days)' });
    if (m.sat === 'lights') legendItems.push({ sw: '#facc15', t: 'Night lights (Black Marble)' });
    if (m.weather && wx?.maps?.[m.weather]) {
      const w = wx.maps[m.weather];
      legendItems.push({ ramp: RAMP_CSS[m.weather], t: `${w.label}`, range: `${Math.round(w.min)}–${Math.round(w.max)} ${w.unit}` });
    }
  }
  const photoDate = sat?.dates[date]?.photoDate;

  return (
    <div className={`app ${lowQuality ? 'lq' : ''}`}>
      <header className="top">
        <div>
          <h1>Dancing with SARs <span className="by">by Feynman Diagrams</span></h1>
          <p className="sub">
            South Florida never stands still. Water spreads and shrinks, plants grow and burn, and cities glow. The NISAR radar
            satellite watches it all every 12 days, through clouds, day and night. Click a colored area, or any spot, to explore.
          </p>
        </div>
        <div className="top-actions">
          <button className={`lq-btn ${lowQuality ? 'on' : ''}`} onClick={() => setLowQuality((q) => !q)} aria-pressed={lowQuality}>
            <span className="lq-dot" aria-hidden /> Low Quality Mode: <strong>{lowQuality ? 'ON' : 'OFF'}</strong>
          </button>
          <button className="sources-btn" onClick={() => setSourcesOpen(true)}>📚 Data sources</button>
        </div>
      </header>

      <main className="main">
        <section className="map-wrap">
          <MapView
            mode={effectiveMode}
            selected={selected}
            onSelect={select}
            spot={spot}
            onSpot={pickSpot}
            date={date}
            view={view}
            active={active}
            lowQuality={lowQuality}
            nisar={nisar}
            sat={sat}
            wx={wx}
          />

          <div className="map-tools">
            <div className="seg" role="group" aria-label="2D or 3D">
              <button className={effectiveMode === '2d' ? 'on' : ''} onClick={() => setMode('2d')}>2D</button>
              <button className={effectiveMode === '3d' ? 'on' : ''} onClick={() => setMode('3d')} disabled={lowQuality} title={lowQuality ? 'Turn off Low Quality Mode for 3D' : ''}>3D</button>
            </div>
            <div className="seg" role="group" aria-label="Map picture">
              <button className={view === 'radar' ? 'on' : ''} onClick={() => setView('radar')}>Radar image</button>
              <button className={view === 'change' ? 'on' : ''} onClick={() => setView('change')}>What changed</button>
              <button className={view === 'photo' ? 'on' : ''} onClick={() => setView('photo')}>Satellite photo</button>
              <button className={view === 'plain' ? 'on' : ''} onClick={() => setView('plain')}>Plain map</button>
            </div>
          </div>

          <div className="legend">
            {view === 'radar' && (
              <>
                <strong>NISAR radar colors</strong>
                <span><i style={{ background: '#3fae49' }} /> Plants</span>
                <span><i style={{ background: '#efe3ef' }} /> Buildings / flooded trees</span>
                <span><i style={{ background: '#1e1b3a' }} /> Calm water</span>
              </>
            )}
            {view === 'change' && (
              <>
                <strong>Radar echo vs. {fmtShort(dates[0] ?? date)}</strong>
                <span><i style={{ background: '#f97316' }} /> Stronger {effectiveMode === '3d' ? '(taller = more change)' : ''}</span>
                <span><i style={{ background: '#3b82f6' }} /> Weaker: more water, fewer plants</span>
              </>
            )}
            {view === 'photo' && (
              <>
                <strong>True-color photo (VIIRS)</strong>
                <span>{photoDate ? `Taken ${fmtShort(photoDate)}, clearest day near this pass` : 'No photo for this date'}</span>
                <span className="small-muted">White patches are clouds. Radar sees through them!</span>
              </>
            )}
            {legendItems.length > 0 && (
              <div className="legend-layers">
                {legendItems.map((it) => (
                  <span key={it.t}>
                    {it.ramp ? <i className="ramp" style={{ background: it.ramp }} /> : <i style={{ background: it.sw }} />} {it.t}
                    {it.range && <small> ({it.range})</small>}
                  </span>
                ))}
              </div>
            )}
            <div className="legend-regions">
              {Object.values(REGIONS).map((r) => (
                <button key={r.id} onClick={() => select(r.id)} className={selected === r.id ? 'on' : ''}>
                  <i style={{ background: rgb(r.color) }} /> {r.name}
                </button>
              ))}
            </div>
          </div>

          {loadError && <div className="banner">{loadError}</div>}
          {!loadError && (server === 'offline' || server === 'no-credentials') && (
            <div className="banner warn">
              {server === 'offline'
                ? 'Live weather is offline. Start the site with "npm run dev" so the weather server runs too.'
                : 'Live weather needs your Meteomatics login: add it to the .env file (see .env.example) and restart.'}
              {' '}The maps still work.
            </div>
          )}
        </section>

        <SidePanel
          selected={selected}
          onSelect={select}
          spot={spot}
          onSpot={pickSpot}
          activeLayers={active}
          date={date}
          nisar={nisar}
          lights={lights}
          sat={sat}
          wx={wx}
        />
      </main>

      <footer className="bottom">
        <Timeline
          dates={dates}
          index={index}
          onChange={setIndex}
          playing={playing}
          onPlay={onPlay}
          stepMs={lowQuality ? 2000 : 1400}
          soundOn={soundOn}
          onSound={onSound}
          onStep={onStep}
        />
        <LayerBar active={active} onToggle={toggle} />
      </footer>

      <SourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} nisar={nisar} />
    </div>
  );
}
