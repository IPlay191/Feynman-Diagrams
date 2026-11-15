// "Other perspective": earthquakes in La Guaira, Venezuela, seen by NISAR. Loaded only when the
// visitor switches to it; South Florida is unloaded meanwhile.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALARM_LEVEL, QuakeSonifier } from './quakeSound.js';
import LaGuairaMap from './LaGuairaMap.jsx';
import LaGuairaPanel from './LaGuairaPanel.jsx';
import SourcesPanel from '../components/SourcesPanel.jsx';
import { LG_SOURCES } from '../data/sources.js';
import { rampCss } from './ramp.js';

const fmt = (d, o) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
// approximation of NISAR's ring colors (a looping color scale), for the map key
const RINGS_CSS = 'linear-gradient(90deg, #f1e6ef, #7b8fd6, #3d2a7a, #2a1530, #7a2e2e, #c9864f, #f1e6ef)';

function initialLowQuality() {
  const saved = localStorage.getItem('lowQuality');
  if (saved !== null) return saved === '1';
  return (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || false;
}

// How much the ground moved in a 12-day comparison, from 0 (still) to 1 (huge).
// Where NISAR's movement was measured in cm, that number is used (60 cm or more = 1).
// Elsewhere it is estimated from the strongest quake in those days.
function levelFor(data, pair) {
  if (!pair) return 0;
  const m = pair.movement ? data.movement[pair.movement] : null;
  if (m?.typical != null) return Math.min(1, m.typical / 60);
  const mags = data.quakes.filter((q) => pair.quakes.includes(q.id)).map((q) => q.mag);
  if (!mags.length) return 0;
  return Math.min(1, Math.max(0, (Math.max(...mags) - 2.5) / 5));
}

function Timeline({ pairs, quakes, index, onChange, playing, onPlay, stepMs, soundOn, onSound, onInteract }) {
  // one step per comparison; the alarm steps stay on screen longer
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => onChange((i) => (i + 1) % pairs.length), stepMs(index));
    return () => clearTimeout(t);
  }, [playing, index, pairs.length, onChange, stepMs]);
  const p = pairs[index];
  // quake marks along the slider (taller = stronger), placed at the first step that shows the quake
  const n = pairs.length - 1;
  const marks = quakes
    .map((q) => ({ q, i: pairs.findIndex((p) => p.toTime > q.time) }))
    .filter((m) => m.i >= 0 && Date.parse(m.q.time) >= Date.parse(pairs[0].fromTime));
  return (
    <div className="timeline">
      <button className="play" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play through time'}>{playing ? '❚❚' : '▶'}</button>
      <button className={`sound ${soundOn ? 'on' : ''}`} onClick={onSound} aria-pressed={soundOn} title="Hear the ground move">
        {soundOn ? '🔊 Sound on' : '🔇 Sound off'}
      </button>
      <div className="tl-main">
        <div className="tl-labels">
          <span>{fmt(pairs[0].to, { month: 'short', year: 'numeric' })}</span>
          <strong>NISAR compared {fmt(p.from, { month: 'short', day: 'numeric' })} → {fmt(p.to, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
          <span>{fmt(pairs.at(-1).to, { month: 'short', year: 'numeric' })}</span>
        </div>
        <div className="tl-track">
          <input
            type="range" min={0} max={pairs.length - 1} value={index}
            onPointerDown={onInteract} onKeyDown={onInteract}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Choose a pair of NISAR passes"
          />
          <div className="tl-quakes" aria-hidden>
            {marks.map(({ q, i }) => (
              <i key={q.id} title={`M${q.mag}`} style={{ left: `${(i / n) * 100}%`, height: `${4 + (q.mag - 2.5) * 3}px` }} />
            ))}
          </div>
        </div>
        <div className="sound-help">
          Red marks = earthquakes. Taller mark = stronger quake.
          {soundOn && ' · Sound: soft hum = calm ground · thump = earthquake · siren = the ground moved a lot'}
        </div>
      </div>
    </div>
  );
}

export default function LaGuairaApp({ onSwitch }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState('3d');
  const [view, setView] = useState('rings'); // 'rings' | 'movement'
  const [selectedQuake, setSelectedQuake] = useState(null);
  const [lowQuality, setLowQuality] = useState(initialLowQuality);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(() => window.innerHeight >= 800);
  const [soundOn, setSoundOn] = useState(true);
  const sound = useRef(null);
  // sound can only start after a click or drag (browser rule)
  const wakeSound = useCallback(() => {
    if (!soundOn) return;
    sound.current ??= new QuakeSonifier();
    sound.current.start();
  }, [soundOn]);
  // switching back to South Florida stops and frees the audio
  useEffect(() => () => sound.current?.close(), []);

  useEffect(() => {
    fetch('/data/laguaira.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => {
        setData(d);
        // start on the passes that caught the big quake
        const pairs = [...d.pairs].sort((a, b) => a.toTime.localeCompare(b.toTime));
        const i = pairs.findIndex((p) => p.quakes.includes(d.biggest));
        setIndex(i >= 0 ? i : pairs.length - 1);
      })
      .catch(() => setError('La Guaira data not found. Run "npm run fetch:laguaira" first.'));
  }, []);
  useEffect(() => localStorage.setItem('lowQuality', lowQuality ? '1' : '0'), [lowQuality]);

  const pairs = useMemo(() => (data ? [...data.pairs].sort((a, b) => a.toTime.localeCompare(b.toTime)) : []), [data]);
  const pair = pairs[index];
  const hasMove = Boolean(pair?.movement);
  const effView = view === 'movement' && hasMove ? 'movement' : 'rings';
  const effMode = lowQuality ? '2d' : mode;

  const stepMs = useCallback((i) => (data && levelFor(data, pairs[i]) >= ALARM_LEVEL ? 3200 : 1600), [data, pairs]);

  // one sound per comparison: when playing, right away; when dragging, once the slider stops
  useEffect(() => {
    if (!soundOn || !data || !pair || !sound.current?.ready) return;
    const t = setTimeout(() => {
      const mags = data.quakes.filter((q) => pair.quakes.includes(q.id)).map((q) => q.mag);
      sound.current.step({ level: levelFor(data, pair), mags }, (stepMs(index) / 1000) * 0.95);
    }, playing ? 0 : 140);
    return () => clearTimeout(t);
  }, [index, soundOn, data, pair, playing, stepMs]);

  const onPlay = () => {
    if (!playing) wakeSound();
    setPlaying((p) => !p);
  };
  const onSound = () => {
    if (soundOn) sound.current?.stop();
    else {
      sound.current ??= new QuakeSonifier();
      sound.current.start();
    }
    setSoundOn((s) => !s);
  };

  const pickQuake = (id) => {
    wakeSound();
    setSelectedQuake(id);
    setPlaying(false);
    const q = data.quakes.find((x) => x.id === id);
    // jump to the first pair of passes that contains this quake
    const i = pairs.findIndex((p) => p.fromTime <= q.time && p.toTime > q.time);
    if (i >= 0) setIndex(i);
  };

  return (
    <div className={`app ${lowQuality ? 'lq' : ''}`}>
      <header className="top">
        <div>
          <h1>Dancing with SARs <span className="by">by Feynman Diagrams</span></h1>
          <p className="sub">
            Other perspective: <b>La Guaira, Venezuela</b>. On June 24, 2026, a magnitude 7.5 earthquake shook this coast. From
            space, NISAR measured how far the ground moved. Play the year, or click a quake.
          </p>
        </div>
        <div className="top-actions">
          <button className={`lq-btn ${lowQuality ? 'on' : ''}`} onClick={() => setLowQuality((q) => !q)} aria-pressed={lowQuality}>
            <span className="lq-dot" aria-hidden /> Low Quality Mode: <strong>{lowQuality ? 'ON' : 'OFF'}</strong>
          </button>
          <button className="sources-btn switch-btn" onClick={onSwitch}>🌴 Back to South Florida</button>
          <button className="sources-btn" onClick={() => setSourcesOpen(true)}>📚 Data sources</button>
        </div>
      </header>

      <main className="main">
        <section className="map-wrap">
          {data && (
            <LaGuairaMap data={data} pair={pair} view={effView} mode={effMode} lowQuality={lowQuality} selectedQuake={selectedQuake} onQuake={pickQuake} />
          )}
          <div className="map-tools">
            <div className="seg" role="group" aria-label="2D or 3D">
              <button className={effMode === '2d' ? 'on' : ''} onClick={() => setMode('2d')}>2D</button>
              <button className={effMode === '3d' ? 'on' : ''} onClick={() => setMode('3d')} disabled={lowQuality} title={lowQuality ? 'Turn off Low Quality Mode for 3D' : ''}>3D</button>
            </div>
            <div className="seg" role="group" aria-label="Map picture">
              <button className={effView === 'rings' ? 'on' : ''} onClick={() => setView('rings')}>NISAR rings</button>
              <button
                className={effView === 'movement' ? 'on' : ''}
                onClick={() => setView('movement')}
                disabled={!hasMove}
                title={hasMove ? '' : 'Measured in centimeters for the passes around the M7.5 quake (Jun 2026)'}
              >
                Ground movement (cm)
              </button>
            </div>
          </div>

          {data && (
            <div className={`legend ${keyOpen ? '' : 'closed'}`}>
              <button className="legend-toggle" onClick={() => setKeyOpen((o) => !o)} aria-expanded={keyOpen}>
                {keyOpen ? '▾ Hide map key' : '▸ Show map key'}
              </button>
              {keyOpen && (
                <>
                  {effView === 'rings' ? (
                    <>
                      <strong>NISAR rings</strong>
                      <span><i className="ramp" style={{ background: RINGS_CSS }} /> One full loop = about {data.source.cmPerFringe} cm of movement</span>
                      <span className="small-muted">Tight rings = the ground moved a lot.</span>
                    </>
                  ) : (
                    <>
                      <strong>How far the ground moved</strong>
                      <span className="ramp-row"><i className="ramp wide" style={{ background: rampCss(data.ramp) }} /></span>
                      <span className="ramp-scale"><small>0 cm</small><small>{data.ramp.at(-1)[0]}+ cm</small></span>
                      {effMode === '3d' && <span className="small-muted">Taller column = moved more.</span>}
                    </>
                  )}
                  <div className="legend-layers">
                    <span><i className="qdot now" /> Earthquake in these 12 days</span>
                    <span><i className="qdot" /> Earlier earthquake</span>
                    <span className="small-muted">Bigger circle = stronger quake.</span>
                  </div>
                </>
              )}
            </div>
          )}
          {error && <div className="banner">{error}</div>}
        </section>
        <LaGuairaPanel data={data} pair={pair} view={effView} selectedQuake={selectedQuake} onQuake={pickQuake} />
      </main>

      <footer className="bottom">
        {pairs.length > 0 && (
          <Timeline
            pairs={pairs} quakes={data.quakes} index={index} onChange={setIndex} playing={playing} onPlay={onPlay}
            stepMs={stepMs} soundOn={soundOn} onSound={onSound} onInteract={wakeSound}
          />
        )}
      </footer>

      <SourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} sources={LG_SOURCES}>
        {data && (
          <section>
            <h3>The NISAR products in this view</h3>
            <p className="small">{data.pairs.length} ground-movement products (GUNW): ascending track 61 and descending track 126.</p>
            <details>
              <summary>Show all product IDs</summary>
              <ul className="granules">
                {data.pairs.map((p) => (
                  <li key={p.key}>
                    <strong>{p.from} → {p.to}</strong>
                    <a href={`https://search.asf.alaska.edu/#/?searchType=List%20Search&searchList=${p.fileID}`} target="_blank" rel="noreferrer">{p.fileID}</a>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
      </SourcesPanel>
    </div>
  );
}
