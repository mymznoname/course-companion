import Chip from './Chip.jsx'

/**
 * 单节卡片
 * Props:
 *   lesson: { id, ordinal, title, status, plannedDate, orderInDay, courseId, completedAt, skipReason }
 *   summary: bool 是否有总结
 *   courseTitle: string 课程名
 *   overdue: bool 是否逾期
 *   selectable: bool 多选模式(显示复选框,点卡片切换选中)
 *   selected: bool
 *   onDone / onSkip / onEditSummary / onRestore / onToggleSelect
 */
export default function LessonCard({
  lesson, summary, courseTitle, overdue,
  selectable = false, selected = false,
  onDone, onSkip, onEditSummary, onRestore, onToggleSelect
}) {
  const isDone = lesson.status === 'done'
  const isSkipped = lesson.status === 'skipped'

  const cardStyle = {
    padding: 14,
    cursor: selectable ? 'pointer' : undefined,
    borderColor: selected ? 'var(--c-primary)' : undefined,
    background: selected ? 'var(--c-primary-tint)' : undefined
  }

  function handleCardClick() {
    if (selectable) onToggleSelect?.(lesson)
  }

  return (
    <div className="card" style={cardStyle} onClick={handleCardClick}>
      <div className="row-between">
        <div className="row gap-2" style={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
          {selectable && (
            <div
              className={`check ${selected ? 'checked' : ''}`}
              aria-hidden
              style={{ marginTop: 2 }}
            >
              {selected && '✓'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-xs text-muted">
              {courseTitle} · 第 {lesson.ordinal} 节
            </div>
            <div className="h3 mt-1" style={{ wordBreak: 'break-word' }}>{lesson.title}</div>
            <div className="row gap-2 mt-2">
              {isDone && <Chip kind="success">已学完</Chip>}
              {isSkipped && <Chip>已跳过</Chip>}
              {!isDone && !isSkipped && summary && <Chip kind="primary">已总结</Chip>}
              {!isDone && !isSkipped && !summary && <Chip kind="warning">待总结</Chip>}
              {overdue && !isDone && <Chip kind="warning">逾期</Chip>}
            </div>
          </div>
        </div>
        {!selectable && (
          <div className={`check ${isDone ? 'checked' : ''}`} aria-hidden>
            {isDone && '✓'}
          </div>
        )}
      </div>

      {!selectable && !isDone && !isSkipped && (
        <div className="row gap-2 mt-3">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onDone?.(lesson)}>
            已学完
          </button>
          <button className="btn btn-secondary" onClick={() => onEditSummary?.(lesson)}>
            {summary ? '改总结' : '写总结'}
          </button>
        </div>
      )}

      {!selectable && !isDone && !isSkipped && (
        <button className="btn btn-ghost btn-sm mt-2" style={{ width: '100%' }} onClick={() => onSkip?.(lesson)}>
          跳过这一节
        </button>
      )}

      {!selectable && isDone && summary && (
        <button className="btn btn-ghost btn-sm mt-2" style={{ width: '100%' }} onClick={() => onEditSummary?.(lesson)}>
          改总结
        </button>
      )}

      {!selectable && isSkipped && (
        <button className="btn btn-secondary btn-sm mt-3" style={{ width: '100%' }} onClick={() => onRestore?.(lesson)}>
          取消跳过
        </button>
      )}
    </div>
  )
}
