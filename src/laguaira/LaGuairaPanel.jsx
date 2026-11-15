// Side panel for La Guaira: what NISAR saw in the chosen 12 days, the quakes, and the measured movement.
import { LG_QUAKE_KM } from '../../shared/laguaira.js';

const fmtDay = (d) => new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
// Venezuela is UTC-4 all year
const fmtLocal = (t) =>
  new Date(t).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Caracas' });

// USGS shaking intensity (Modified Mercalli) in words
const MMI = ['', 'not felt', 'weak', 'weak', 'light', 'moderate', 'strong', 'very strong', 'severe', 'violent', 'extreme', 'extreme', 'extreme'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Left-looking NISAR: flying south (descending) it looks east, so it sees the ground from the west;
// flying north (ascending) it sees the ground from the east. (From the look vectors in the files.)
const flight = (dir) => (dir === 'descending' ? 'flying south, looking from the west' : 'flying north, looking from the east');

function QuakeCard({ q }) {
  const mmi = q.mmi ? Math.round(q.mmi) : null;
  return (
    <section className="fact quake-card">
      <h3>🔴 Magnitude {q.mag} earthquake</h3>
      <p>{fmtLocal(q.time)} (local time)</p>
      <ul className="facts">
        <li><span>Where</span><b>{q.place}</b></li>
        <li><span>How deep</span><b>{q.depth} km underground</b></li>
        {mmi && <li><span>Strongest shaking</span><b>{MMI[mmi]} (level {ROMAN[mmi]} of XII)</b></li>}
        {q.felt > 0 && <li><span>People who reported feeling it</span><b>{q.felt.toLocaleString()}</b></li>}
        {q.alert && <li><span>USGS alert level</span><b className={`alert-${q.alert}`}>{q.alert}{q.alert === 'red' ? ' (the highest)' : ''}</b></li>}
      </ul>
      {q.fault?.kind === 'sideways' && (
        <p className="small-muted">
          USGS found this was a <b>sideways</b> ("strike-slip") quake: the two sides of the fault slid past each other
          {q.fault.maxSlipM ? <>, by up to <b>{q.fault.maxSlipM} m</b> deep underground</> : null}.
        </p>
      )}
      <a className="small-muted" href={q.url} target="_blank" rel="noreferrer">USGS event page ↗</a>
    </section>
  );
}

function Movement({ data, big }) {
  const during = data.movement.during;
  const before = data.movement.before;
  if (!during) return null;
  const towns = during.towns.filter((t) => t.total !== null);
  const beforeOf = (name) => before?.towns.find((t) => t.name === name)?.total ?? null;
  const max = Math.max(...towns.map((t) => t.total), 1);
  const west = towns.filter((t) => t.east < 0).length >= towns.length / 2;
  const top = [...towns].sort((a, b) => b.total - a.total)[0];
  return (
    <section className="fact">
      <h3>📏 How far the ground moved</h3>
      <p>
        NISAR compared passes from just before and just after the quake ({fmtDay(during.from)} to {fmtDay(during.to)}). The
        biggest shift we measured in a town was <b>{Math.round(top.total)} cm</b> in {top.name}. Most of the coast slid{' '}
        <b>{west ? 'west' : 'east'}</b>, with almost no up or down movement.
      </p>
      <div className="move-table" role="table" aria-label="Ground movement per town">
        <div className="mt-head" role="row"><span>Town</span><span>During the quake</span><span>12 days before</span></div>
        {towns.map((t) => {
          const b = beforeOf(t.name);
          return (
            <div key={t.name} className="mt-row" role="row">
              <span>{t.name}</span>
              <span className="mt-bar">
                <i style={{ width: `${(t.total / max) * 100}%` }} />
                <b>{Math.round(t.total)} cm</b> {t.east < -2 ? '← west' : t.east > 2 ? 'east →' : ''}
              </span>
              <span className="mt-bar before">
                {b !== null ? <><i style={{ width: `${(b / max) * 100}%` }} /><b>{Math.round(b)} cm</b></> : '–'}
              </span>
            </div>
          );
        })}
      </div>
      <p className="small-muted">
        Sideways = east-west movement. Up/down was {Math.round(Math.max(...towns.map((t) => Math.abs(t.up))))} cm or less in every
        town. Some places (like Naiguatá) have no reading: there the radar echo changed too much between passes to measure.
      </p>
      <h3>✅ How do we know it is real?</h3>
      <ul className="checks">
        <li>
          <b>Before the quake it stayed still.</b> In the 12 days before, the same method found only about{' '}
          {Math.round(before?.typical ?? 0)} cm, the normal error from the air and the radar. During the quake: {Math.round(during.typical)} cm
          on average, up to {Math.round(during.high)} cm.
        </li>
        <li>
          <b>Two different views agree.</b> NISAR flew over twice, once heading north and once heading south, seeing the ground
          from opposite sides. Each sees only part of the movement, but together they line up on one answer.
        </li>
        {big?.fault?.kind === 'sideways' && (
          <li>
            <b>It matches the seismometers.</b> USGS, using earthquake sensors on the ground, found a sideways quake. NISAR, from
            space, measured sideways movement too.
          </li>
        )}
      </ul>
    </section>
  );
}

export default function LaGuairaPanel({ data, pair, view, selectedQuake, onQuake }) {
  if (!data || !pair) return <aside className="panel"><div className="panel-body"><p>Loading…</p></div></aside>;
  const big = data.quakes.find((q) => q.id === data.biggest);
  const inPair = data.quakes.filter((q) => pair.quakes.includes(q.id));
  const strongest = inPair.reduce((m, q) => (!m || q.mag > m.mag ? q : m), null);
  const sel = data.quakes.find((q) => q.id === selectedQuake);
  const showMove = pair.movement === 'during' || view === 'movement';
  const cm = data.source.cmPerFringe;
  return (
    <aside className="panel lg-panel">
      <div className="panel-body">
        <h2>La Guaira, Venezuela</h2>
        <p className="tagline lg-tag">Where two of Earth's plates grind past each other</p>
        <p className="lead">
          La Guaira is the narrow coast just north of Caracas, squeezed between the Caribbean Sea and the steep Ávila
          mountains. It has Venezuela's main airport and a busy port. Just offshore, the Caribbean plate slides east past South
          America, about 2 cm a year. Usually that is too slow to notice. Then, on June 24, 2026, the fault snapped.
        </p>

        <section className="fact">
          <h3>🛰️ This NISAR comparison</h3>
          <p><b>{fmtDay(pair.from)} → {fmtDay(pair.to)}</b></p>
          <p className="small-muted">NISAR {flight(pair.direction)} (track {pair.track}).</p>
          {inPair.length ? (
            <p>
              <b>{inPair.length} earthquake{inPair.length > 1 ? 's' : ''}</b> happened in these days
              {strongest ? <>, the strongest was <b>M{strongest.mag}</b></> : null}.
            </p>
          ) : (
            <p>No earthquakes (magnitude 2.5 or more) near La Guaira in these days.</p>
          )}
          <p className="small-muted">
            {strongest && strongest.mag >= 6
              ? 'See the rings packed tightly along the coast? Each loop of colors is the ground moving about ' + cm + ' cm. Many loops close together means a lot of movement.'
              : 'Smooth colors with no tight rings mean the ground stayed put. Slow color changes come from the air (moisture and the upper atmosphere), not the ground.'}
          </p>
        </section>

        {sel ? <QuakeCard q={sel} /> : strongest?.mag >= 6 ? <QuakeCard q={strongest} /> : null}
        {showMove && <Movement data={data} big={big} />}

        <section className="fact">
          <h3>📋 Every earthquake near La Guaira</h3>
          <p className="small-muted">Magnitude 2.5 or more, within {LG_QUAKE_KM} km, since NISAR started. Click one to see it on the map.</p>
          <ul className="quake-list">
            {data.quakes.map((q) => (
              <li key={q.id}>
                <button className={`quake-btn ${q.id === selectedQuake ? 'on' : ''} ${pair.quakes.includes(q.id) ? 'now' : ''}`} onClick={() => onQuake(q.id)}>
                  <span className="qmag" style={{ '--s': `${10 + (q.mag - 2.5) * 4}px` }}>M{q.mag}</span>
                  <span>
                    <b>{fmtDay(q.time)}</b>
                    <small>{q.place}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="fact">
          <h3>🔊 How can a satellite see the ground move?</h3>
          <p>
            NISAR works a bit like an echo. It sends radar waves about {data.source.wavelengthCm} cm long to the ground and catches the
            echo. Twelve days later it passes the same spot and does it again. If the ground moved even a few centimeters, the new
            echo comes back slightly out of step with the old one.
          </p>
          <p>
            Mapping that difference over a whole region makes the colored rings (scientists call it an <b>interferogram</b>). Each
            full loop of colors means the ground moved about <b>{cm} cm</b> closer to or farther from the satellite. Radar sees through
            clouds and at night, so it works even right after a disaster.
          </p>
        </section>
      </div>
    </aside>
  );
}
