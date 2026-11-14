// Tiny line chart. `points` = [{ x: Date|number, y: number|null }], `marker` = x to highlight.
export default function Sparkline({ points, marker, color = '#38bdf8', height = 46, yMin, yMax, label }) {
  const pts = points.filter((p) => p.y !== null && p.y !== undefined);
  if (pts.length < 2) return <div className="spark-empty">Not enough data</div>;
  const W = 300;
  const H = height;
  const xs = pts.map((p) => +p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const lo = yMin ?? Math.min(...ys);
  const hi = yMax ?? Math.max(...ys);
  const span = hi - lo || 1;
  const sx = (x) => ((x - x0) / (x1 - x0 || 1)) * (W - 4) + 2;
  const sy = (y) => H - 3 - ((y - lo) / span) * (H - 6);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(+p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const area = `${d}L${sx(xs.at(-1))},${H}L${sx(xs[0])},${H}Z`;
  const m = marker !== undefined ? pts.reduce((best, p) => (Math.abs(+p.x - +marker) < Math.abs(+best.x - +marker) ? p : best), pts[0]) : null;

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={area} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      {m && (
        <>
          <line x1={sx(+m.x)} x2={sx(+m.x)} y1="0" y2={H} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          <circle cx={sx(+m.x)} cy={sy(m.y)} r="3" fill={color} stroke="#0b1220" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}
