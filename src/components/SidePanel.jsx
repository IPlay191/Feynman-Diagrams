import { REGIONS } from '../../shared/regions.js';
import { LAYERS } from '../../shared/layers.js';
import LayerCard from './LayerCard.jsx';
import { FUTURE } from '../data/insights.js';

const rgb = (c) => `rgb(${c.join(',')})`;

function Overview({ onSelect }) {
  return (
    <div className="panel-body">
      <h2>Pick a place to explore</h2>
      <p className="lead">Click one of the colored areas on the map, or choose one here.</p>
      <div className="region-list">
        {Object.values(REGIONS).map((r) => (
          <button key={r.id} className="region-btn" style={{ '--c': rgb(r.color) }} onClick={() => onSelect(r.id)}>
            <span className="dot" />
            <span>
              <strong>{r.name}</strong>
              <small>{r.tagline}</small>
            </span>
          </button>
        ))}
      </div>

      <h3>What is NISAR?</h3>
      <p>
        NISAR is a satellite built by NASA and ISRO (India's space agency). It launched in July 2025. Instead of taking
        photos, it sends out radar waves and listens for the echo, a bit like a bat. Radar works day and night and sees
        through clouds and smoke. NISAR maps almost all of Earth's land every 12 days.
      </p>
      <h3>How to read the radar image</h3>
      <ul className="legend-list">
        <li><span className="sw" style={{ background: '#3fae49' }} /> Green: plants and trees (the signal gets scrambled)</li>
        <li><span className="sw" style={{ background: '#e8d8e8' }} /> White or pink: buildings, or water under trees (a "double bounce")</li>
        <li><span className="sw" style={{ background: '#20203a' }} /> Dark: calm water (radar bounces away like off a mirror)</li>
      </ul>
      <h3>What could NISAR do next?</h3>
      <ul className="future">
        {FUTURE.map((f) => <li key={f}>{f}</li>)}
      </ul>
    </div>
  );
}

export default function SidePanel({ selected, onSelect, activeLayers, date, nisar, lights }) {
  if (!selected) return <aside className="panel"><Overview onSelect={onSelect} /></aside>;
  const r = REGIONS[selected];
  const layers = [...activeLayers].map((id) => LAYERS[id]);
  return (
    <aside className="panel" style={{ '--c': rgb(r.color) }}>
      <div className="panel-body">
        <button className="back" onClick={() => onSelect(null)}>← All of South Florida</button>
        <h2 className="region-title"><span className="dot" />{r.name}</h2>
        <p className="tagline">{r.tagline}</p>
        <p className="lead">{r.intro}</p>
        {layers.length === 0 && <p className="hint">Tick a box at the bottom (Flooding, Fires…) to see what is changing here.</p>}
        {layers.map((l) => (
          <LayerCard key={l.id} region={r} layer={l} date={date} nisar={nisar} lights={lights} />
        ))}
      </div>
    </aside>
  );
}
