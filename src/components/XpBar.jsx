import { useProfile, xpForLevel } from '../store/profile.js'
import ProgressBar from './ProgressBar.jsx'

export default function XpBar() {
  const level = useProfile((s) => s.level)
  const xp = useProfile((s) => s.xp)
  const { current, next } = xpForLevel(level)
  const into = xp - current
  const need = next - current
  const pct = need > 0 ? (into / need) * 100 : 0

  return (
    <div className="row gap-2" style={{ width: '100%' }}>
      <div
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--c-primary-tint)', color: 'var(--c-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14
        }}
      >
        Lv.{level}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-between text-xs">
          <span className="text-muted">经验 {xp}</span>
          <span className="text-muted">{next - xp} 升级</span>
        </div>
        <div className="mt-1"><ProgressBar value={into} max={need} /></div>
      </div>
    </div>
  )
}
