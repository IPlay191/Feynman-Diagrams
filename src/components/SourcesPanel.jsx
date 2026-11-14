import { useEffect, useRef } from 'react';
import { SOURCES } from '../data/sources.js';

export default function SourcesPanel({ open, onClose, nisar }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="sources" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="sources-inner">
        <header>
          <h2>Data sources & how we used them</h2>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {SOURCES.map((g) => (
          <section key={g.group}>
            <h3>{g.group}</h3>
            <ul>
              {g.items.map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a>
                  <p>{s.used}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {nisar && (
          <section>
            <h3>The NISAR scenes in this app</h3>
            <p className="small">
              {nisar.dates.length} passes, {nisar.source.direction} track {nisar.source.track}, frames {nisar.source.frames.join(' + ')}.
              {' '}{nisar.source.note}
            </p>
            <details>
              <summary>Show all granule IDs</summary>
              <ul className="granules">
                {nisar.dates.map((d) => (
                  <li key={d.date}>
                    <strong>{d.date}</strong>
                    {d.granules.map((g) => (
                      <a key={g} href={`https://search.asf.alaska.edu/#/?searchType=List%20Search&searchList=${g}`} target="_blank" rel="noreferrer">{g}</a>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
      </div>
    </dialog>
  );
}
