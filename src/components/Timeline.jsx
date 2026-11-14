import { useEffect } from 'react';

const fmt = (d, opts) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', opts);

export default function Timeline({ dates, index, onChange, playing, onPlay, stepMs, soundOn, onSound, onStep }) {
  // Animation: step through the 12-day NISAR passes
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => onChange((i) => (i + 1) % dates.length), stepMs);
    return () => clearInterval(t);
  }, [playing, dates.length, onChange, stepMs]);

  // play one sound per step while playing
  useEffect(() => {
    if (playing) onStep?.(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing]);

  if (!dates.length) return null;
  const cur = dates[index];
  return (
    <div className="timeline">
      <button className="play" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play through time'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button className={`sound ${soundOn ? 'on' : ''}`} onClick={onSound} aria-pressed={soundOn} title="Hear the data while it plays">
        {soundOn ? '🔊 Sound on' : '🔇 Sound off'}
      </button>
      <div className="tl-main">
        <div className="tl-labels">
          <span>{fmt(dates[0], { month: 'short', year: 'numeric' })}</span>
          <strong>NISAR pass: {fmt(cur, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</strong>
          <span>{fmt(dates.at(-1), { month: 'short', year: 'numeric' })}</span>
        </div>
        <input type="range" min={0} max={dates.length - 1} value={index} onChange={(e) => onChange(Number(e.target.value))} aria-label="Choose a date" />
        {soundOn && (
          <div className="sound-help">Press ▶ to listen: higher note = more of what the radar measures · taps = rain · buzzy = dirtier air</div>
        )}
      </div>
    </div>
  );
}
