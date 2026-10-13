import { num } from '../lib/lab';

const POINTS = 60;
const W = 300;

export function LineChart({ title, data, series, height = 110, max, unit = '' }) {
  const top = max ?? Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] ?? 0))) * 1.1;
  const x = (i) => ((i + POINTS - data.length) / (POINTS - 1)) * W;
  const y = (v) => height - (Math.min(v, top) / top) * (height - 4) - 2;
  const last = data.at(-1);

  return (
    <div className="card chart">
      <div className="chart-head">
        <h3>{title}</h3>
        <span className="muted">max {num(top, 0)}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={height * g} y2={height * g} className="grid" />
        ))}
        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            points={data.map((d, i) => `${x(i)},${y(d[s.key] ?? 0)}`).join(' ')}
          />
        ))}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label} <b>{num(last?.[s.key], 1)}{unit}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
