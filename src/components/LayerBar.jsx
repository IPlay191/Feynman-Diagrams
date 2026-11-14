import { LAYERS } from '../../shared/layers.js';

export default function LayerBar({ active, onToggle }) {
  return (
    <fieldset className="layerbar">
      <legend>What do you want to see?</legend>
      {Object.values(LAYERS).map((l) => (
        <label key={l.id} className={`chip ${active.has(l.id) ? 'on' : ''}`} style={{ '--accent': l.color }}>
          <input type="checkbox" checked={active.has(l.id)} onChange={() => onToggle(l.id)} />
          <span className="box" aria-hidden>{active.has(l.id) ? '✓' : ''}</span>
          <span aria-hidden>{l.icon}</span> {l.label}
        </label>
      ))}
    </fieldset>
  );
}
