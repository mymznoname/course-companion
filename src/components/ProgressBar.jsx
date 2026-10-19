export default function ProgressBar({ value = 0, max = 100, color }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
