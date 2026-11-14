import { useCallback, useEffect, useState } from 'react';
import MapView from './components/MapView.jsx';
import SidePanel from './components/SidePanel.jsx';
import Timeline from './components/Timeline.jsx';
import LayerBar from './components/LayerBar.jsx';
import SourcesPanel from './components/SourcesPanel.jsx';
import { REGIONS } from '../shared/regions.js';
import { loadLights, loadNisar } from './api.js';

const rgb = (c) => `rgb(${c.join(',')})`;

export default function App() {
  const [nisar, setNisar] = useState(null);
  const [lights, setLights] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('3d');
  const [view, setView] = useState('radar'); // 'radar' | 'change' | 'plain'
  const [active, setActive] = useState(() => new Set(['flooding']));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => {
    loadNisar()
      .then((n) => { setNisar(n); setIndex(n.dates.length - 1); })
      .catch(() => setLoadError('NISAR data not found. Run "npm run fetch:nisar" first.'));
    loadLights().then(setLights).catch(() => {});
  }, []);

  const dates = nisar?.dates.map((d) => d.date) ?? [];
  const date = dates[index] ?? '2026-10-27';

  const toggle = useCallback((id) => {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const select = useCallback((id) => setSelected((cur) => (id === cur ? cur : id)), []);

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Dancing with SARs <span className="by">by Feynman Diagrams</span></h1>
          <p className="sub">
            South Florida never stands still. Water spreads and shrinks, plants grow and burn, and cities glow. The NISAR radar
            satellite watches it all every 12 days, through clouds, day and night. Click a colored area to explore it.
          </p>
        </div>
        <button className="sources-btn" onClick={() => setSourcesOpen(true)}>📚 Data sources</button>
      </header>

      <main className="main">
        <section className="map-wrap">
          <MapView
            mode={mode}
            selected={selected}
            onSelect={select}
            date={date}
            showRadar={view === 'radar'}
            showChange={view === 'change'}
            showLights={active.has('lights')}
            studyBounds={nisar?.studyBounds}
          />

          <div className="map-tools">
            <div className="seg" role="group" aria-label="2D or 3D">
              <button className={mode === '2d' ? 'on' : ''} onClick={() => setMode('2d')}>2D</button>
              <button className={mode === '3d' ? 'on' : ''} onClick={() => setMode('3d')}>3D</button>
            </div>
            <div className="seg" role="group" aria-label="Map picture">
              <button className={view === 'radar' ? 'on' : ''} onClick={() => setView('radar')}>Radar image</button>
              <button className={view === 'change' ? 'on' : ''} onClick={() => setView('change')}>What changed</button>
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
                <strong>Compared with {dates[0] ?? 'first pass'}</strong>
                <span><i style={{ background: '#f97316' }} /> Brighter echo</span>
                <span><i style={{ background: '#3b82f6' }} /> Darker echo (more water, fewer plants)</span>
              </>
            )}
            {active.has('lights') && (
              <span><i style={{ background: '#facc15' }} /> Night lights (Black Marble)</span>
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
        </section>

        <SidePanel selected={selected} onSelect={setSelected} activeLayers={active} date={date} nisar={nisar} lights={lights} />
      </main>

      <footer className="bottom">
        <Timeline dates={dates} index={index} onChange={setIndex} playing={playing} onPlay={() => setPlaying((p) => !p)} />
        <LayerBar active={active} onToggle={toggle} />
      </footer>

      <SourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} nisar={nisar} />
    </div>
  );
}
