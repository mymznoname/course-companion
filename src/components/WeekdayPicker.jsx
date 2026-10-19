// 星期选择器:决定这门课每周哪几天学
// value: number[](0=周日 … 6=周六),全选或空 = 每天都学
const LABELS = ['日', '一', '二', '三', '四', '五', '六']

const PRESETS = [
  { key: 'all', label: '每天', value: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'workday', label: '工作日', value: [1, 2, 3, 4, 5] },
  { key: 'weekend', label: '周末', value: [0, 6] }
]

/** 把 0-6 排成「一、三、五」这种人话 */
export function weekdaysText(weekdays) {
  const set = Array.isArray(weekdays) ? [...new Set(weekdays)].sort() : []
  if (set.length === 0 || set.length === 7) return '每天'
  // 按 一→日 的习惯顺序展示(周日放最后)
  const order = [1, 2, 3, 4, 5, 6, 0]
  const names = order.filter(d => set.includes(d)).map(d => LABELS[d])
  return '每周' + names.join('、')
}

export default function WeekdayPicker({ value = [], onChange, disabled = false }) {
  const set = new Set(value || [])
  const isAll = set.size === 7
  const none = set.size === 0

  function toggle(d) {
    const next = new Set(set)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    onChange([...next].sort((a, b) => a - b))
  }

  function applyPreset(v) {
    onChange([...v])
  }

  return (
    <div>
      <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
        {PRESETS.map(p => {
          const active = p.value.length === set.size && p.value.every(d => set.has(d))
          return (
            <button
              key={p.key}
              type="button"
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
              disabled={disabled}
              onClick={() => applyPreset(p.value)}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div
        className="mt-3"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}
      >
        {LABELS.map((label, d) => {
          const on = set.has(d)
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => toggle(d)}
              aria-pressed={on}
              aria-label={`周${label}`}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                padding: 0,
                borderRadius: '50%',
                border: `1px solid ${on ? 'var(--c-primary)' : 'var(--c-border-tertiary)'}`,
                background: on ? 'var(--c-primary)' : 'transparent',
                color: on ? '#fff' : 'var(--c-text-soft)',
                fontSize: 14,
                fontWeight: on ? 600 : 400,
                cursor: disabled ? 'default' : 'pointer'
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="text-xs text-muted mt-2">
        {none
          ? '⚠ 至少选一天,否则排不出计划'
          : isAll
            ? '每天都学'
            : `${weekdaysText(value)} · 每周 ${set.size} 天`}
      </div>
    </div>
  )
}
