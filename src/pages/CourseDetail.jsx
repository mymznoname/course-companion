import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.js'
import { isOverdue } from '../db/scheduler.js'
import ProgressBar from '../components/ProgressBar.jsx'
import Chip from '../components/Chip.jsx'
import WeekdayPicker, { weekdaysText } from '../components/WeekdayPicker.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LessonCard from '../components/LessonCard.jsx'
import SummaryEditor from '../components/SummaryEditor.jsx'
import MarkdownView from '../components/MarkdownView.jsx'
import Modal from '../components/Modal.jsx'
import { useProfile } from '../store/profile.js'
import { useFeedbackFx, fireLessonDoneFx, fireCourseDoneFx, fireLevelUpFx, fireBadgeFx } from '../utils/feedback.js'
import { syncCourseStatus, deleteCourse } from '../db/courses.js'
import { exportCourseAsMarkdown } from '../utils/exportMarkdown.js'
import { downloadText, safeFilename } from '../utils/download.js'
import { rebalanceLessons, toDateStr } from '../db/scheduler.js'
import { skipLessons, restoreLessons } from '../db/skipPlan.js'
import { scheduleReviews } from '../db/reviews.js'

export default function CourseDetail() {
  const { id } = useParams()
  const courseId = Number(id)
  const navigate = useNavigate()

  const course = useLiveQuery(() => db.courses.get(courseId), [courseId])
  const lessons = useLiveQuery(
    () => db.lessons.where('courseId').equals(courseId).toArray(),
    [courseId],
    []
  )
  const summaries = useLiveQuery(() => db.summaries.toArray(), [], [])
  const summaryMap = useMemo(() => {
    const m = {}
    for (const s of summaries) m[s.lessonId] = s
    return m
  }, [summaries])

  const today = toDateStr(new Date())

  const feedbackTier = useProfile((s) => s.feedbackTier)
  const settings = useProfile((s) => s.settings)
  const addXp = useProfile((s) => s.addXp)
  const unlockBadge = useProfile((s) => s.unlockBadge)
  const pushToast = useFeedbackFx((s) => s.pushToast)
  const triggerConfetti = useFeedbackFx((s) => s.triggerConfetti)

  const [editing, setEditing] = useState(null)
  const [paceEditing, setPaceEditing] = useState(false)
  const [newPerDay, setNewPerDay] = useState(2)
  const [newWeekdays, setNewWeekdays] = useState([0, 1, 2, 3, 4, 5, 6])
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [busy, setBusy] = useState(false)
  const [startFromOpen, setStartFromOpen] = useState(false)
  const [startOrdinal, setStartOrdinal] = useState(1)

  const sortedLessons = useMemo(() => {
    const arr = [...(lessons || [])]
    arr.sort((a, b) => a.ordinal - b.ordinal)
    return arr
  }, [lessons])

  const stats = useMemo(() => {
    const done = sortedLessons.filter(l => l.status === 'done').length
    const overdue = sortedLessons.filter(l => isOverdue(l.plannedDate, today) && l.status !== 'done').length
    return { done, overdue, total: sortedLessons.length }
  }, [sortedLessons, today])

  const byDate = useMemo(() => {
    const m = {}
    for (const l of sortedLessons) {
      if (!l.plannedDate) continue
      if (l.status === 'skipped') continue
      if (!m[l.plannedDate]) m[l.plannedDate] = []
      m[l.plannedDate].push(l)
    }
    return m
  }, [sortedLessons])

  // 已跳过的节(不在时间线里,单独展示,可恢复)
  const skippedLessons = useMemo(() => sortedLessons.filter(l => l.status === 'skipped'), [sortedLessons])

  // 按日分组排序
  const dateKeys = useMemo(() => {
    return Object.keys(byDate).sort()
  }, [byDate])

  function startWrite(lesson, mode = 'write') {
    setEditing({
      lesson: {
        id: lesson.id,
        ordinal: lesson.ordinal,
        title: lesson.title,
        courseTitle: course?.title
      },
      // 是否在改已有总结 + 这节课是否已打卡 —— 决定保存后要不要再走一遍打卡流程
      isEdit: !!summaryMap[lesson.id]?.content?.trim(),
      alreadyDone: lesson.status === 'done',
      mode
    })
  }

  async function markDone(lesson) {
    const hasSummary = summaryMap[lesson.id]?.content?.trim()
    if (!hasSummary) {
      startWrite(lesson, 'write')
      pushToast('先写下这节的总结再打卡')
      return
    }
    await db.lessons.update(lesson.id, {
      status: 'done',
      completedAt: new Date().toISOString()
    })
    if (settings.reviewEnabled) {
      await scheduleReviews(lesson.id, settings.reviewIntervals, today)
    }
    fireLessonDoneFx(feedbackTier, pushToast, triggerConfetti)
    const { leveledUp, level } = await addXp(feedbackTier === 'game' ? 10 : 5)
    if (leveledUp) fireLevelUpFx(level, feedbackTier, pushToast, triggerConfetti)

    const doneCount = lessons.filter(l => l.courseId === lesson.courseId && l.status === 'done').length + 1
    if (doneCount === 1) {
      const ok = await unlockBadge('first_lesson')
      if (ok) fireBadgeFx('首节突破', feedbackTier, pushToast)
    }
    if (doneCount === 10) {
      const ok = await unlockBadge('ten_lessons')
      if (ok) fireBadgeFx('十节达成', feedbackTier, pushToast)
    }

    const remaining = await db.lessons
      .where('courseId').equals(lesson.courseId)
      .filter(l => l.status !== 'done')
      .count()
    if (remaining === 0) {
      await syncCourseStatus(lesson.courseId, 'done')
      fireCourseDoneFx(feedbackTier, course.title, pushToast, triggerConfetti)
    }
  }

  /**
   * 总结编辑器保存后的回调。
   * 只有「第一次给一节课写总结、且这节课还没打卡」时才走打卡流程。
   * 改已有总结 → 只更新内容,不重复发奖励,也不覆盖原始完成日期。
   */
  async function handleSaved() {
    const lid = editing?.lesson?.id
    if (!lid) { setEditing(null); return }

    if (editing?.isEdit || editing?.alreadyDone) {
      setEditing(null)
      pushToast('总结已更新')
      return
    }

    const lesson = sortedLessons.find(l => l.id === lid)
    if (lesson && !lesson.status || lesson) {
      await db.lessons.update(lid, {
        status: 'done',
        completedAt: new Date().toISOString()
      })
      if (settings.reviewEnabled) {
        await scheduleReviews(lid, settings.reviewIntervals, today)
      }
      const { leveledUp, level } = await addXp(feedbackTier === 'game' ? 10 : 5)
      fireLessonDoneFx(feedbackTier, pushToast, triggerConfetti)
      if (leveledUp) fireLevelUpFx(level, feedbackTier, pushToast, triggerConfetti)

      const doneCount = await db.lessons
        .where('courseId').equals(courseId)
        .filter(l => l.status === 'done')
        .count()
      if (doneCount === 1) {
        const ok = await unlockBadge('first_lesson')
        if (ok) fireBadgeFx('首节突破', feedbackTier, pushToast)
      }
      const remaining = await db.lessons.where('courseId').equals(courseId).filter(l => l.status !== 'done').count()
      if (remaining === 0) {
        await syncCourseStatus(courseId, 'done')
        fireCourseDoneFx(feedbackTier, course.title, pushToast, triggerConfetti)
      }
    }
    setEditing(null)
  }

  async function archiveCourse() {
    if (!confirm('确定归档这门课吗?归档后不影响已写总结')) return
    await syncCourseStatus(courseId, 'archived')
    pushToast('已归档')
    navigate('/library')
  }

  async function deleteThisCourse() {
    const summaryCount = summaries.length
    const warn = summaryCount > 0
      ? `删除后不可恢复!\n\n这门课有 ${summaryCount} 条已写总结,建议先「导出 Markdown」备份。\n\n确定删除吗?`
      : '删除后不可恢复!确定删除吗?'
    if (!confirm(warn)) return
    if (!confirm('最后确认:真的要删除这门课吗?')) return
    try {
      await deleteCourse(courseId)
      pushToast('课程已删除')
      navigate('/library')
    } catch (e) {
      pushToast('删除失败:' + e.message)
    }
  }

  // ===== 批量跳过 / 恢复 =====
  function toggleSelect(lesson) {
    setSelectedIds(prev =>
      prev.includes(lesson.id) ? prev.filter(x => x !== lesson.id) : [...prev, lesson.id]
    )
  }

  function exitSelect() {
    setSelectMode(false)
    setSelectedIds([])
  }

  async function doSkip(lessonIds) {
    if (!lessonIds.length) { pushToast('先选中要跳过的节'); return }
    setBusy(true)
    try {
      await skipLessons(lessonIds, today)
      pushToast(`已跳过 ${lessonIds.length} 节,后面的任务已往前顶`)
      exitSelect()
    } catch (e) {
      pushToast('操作失败:' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function doRestore(lessonIds) {
    if (!lessonIds.length) return
    setBusy(true)
    try {
      await restoreLessons(lessonIds, today)
      pushToast(`已恢复 ${lessonIds.length} 节`)
    } catch (e) {
      pushToast('操作失败:' + e.message)
    } finally {
      setBusy(false)
    }
  }

  // ===== 指定起始课:把选中的课之前、还没学的全部跳过 =====
  function openStartFrom() {
    // 默认选中第一个还没学的节(即当前进度位置)
    const firstPending = sortedLessons.find(l => l.status !== 'done' && l.status !== 'skipped')
    setStartOrdinal(firstPending ? firstPending.ordinal : 1)
    setStartFromOpen(true)
  }

  const startFromSkipCount = useMemo(
    () => sortedLessons.filter(l => l.ordinal < startOrdinal && l.status !== 'done' && l.status !== 'skipped').length,
    [sortedLessons, startOrdinal]
  )

  async function applyStartFrom() {
    const toSkip = sortedLessons.filter(l => l.ordinal < startOrdinal && l.status !== 'done' && l.status !== 'skipped')
    if (!toSkip.length) {
      pushToast('前面的课都已学完或已跳过,无需操作')
      setStartFromOpen(false)
      return
    }
    setBusy(true)
    try {
      await skipLessons(toSkip.map(l => l.id), today)
      pushToast(`已跳过 ${toSkip.length} 节,从第 ${startOrdinal} 节开始学`)
      setStartFromOpen(false)
    } catch (e) {
      pushToast('操作失败:' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function exportNow() {
    try {
      const md = await exportCourseAsMarkdown(courseId)
      const fname = `${safeFilename(course.title)}_学习笔记.md`
      await db.exports.add({
        courseId,
        scope: 'single',
        format: 'md',
        size: md.length,
        createdAt: new Date().toISOString()
      })
      downloadText(md, fname, 'text/markdown')
      pushToast('笔记已下载')
    } catch (e) {
      pushToast('导出失败')
    }
  }

  async function applyPace() {
    if (!newPerDay || newPerDay < 1) { pushToast('至少 1 节'); return }
    if (!newWeekdays.length) { pushToast('至少选一个星期几'); return }
    const ok = confirm('重新平衡会改变未完成节的计划日期,确定吗?')
    if (!ok) return
    const rescheduled = rebalanceLessons({
      lessons: sortedLessons,
      lessonsPerDay: newPerDay,
      weekendBoosted: course.weekendBoosted,
      weekdays: newWeekdays,
      today
    })
    const done = sortedLessons.filter(l => l.status === 'done')
    const pendingRescheduled = rescheduled.filter(r => !done.find(d => d.ordinal === r.ordinal))
    const now = new Date().toISOString()
    await db.lessons
      .where('courseId').equals(courseId)
      .filter(l => l.status !== 'done')
      .modify({ plannedDate: null, orderInDay: 0, updatedAt: now })
    for (const r of pendingRescheduled) {
      const t = await db.lessons.where('courseId').equals(courseId).filter(l => l.ordinal === r.ordinal).first()
      if (t) {
        await db.lessons.update(t.id, { plannedDate: r.plannedDate, orderInDay: r.orderInDay, updatedAt: now })
      }
    }
    if (pendingRescheduled.length > 0) {
      const dates = pendingRescheduled.map(r => r.plannedDate).sort()
      await db.courses.update(courseId, {
        lessonsPerDay: newPerDay,
        weekdays: newWeekdays,
        plannedEndDate: dates[dates.length - 1],
        updatedAt: now
      })
    }
    setPaceEditing(false)
    pushToast('节奏已更新')
  }

  if (!course) {
    return (
      <div className="page">
        <EmptyState text="课程不存在" />
        <Link to="/library" className="btn btn-secondary" style={{ display: 'block', textAlign: 'center' }}>返回课库</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← 返回</button>
        <div className="row gap-2">
          <button className="btn btn-ghost btn-sm" onClick={openStartFrom}>起始课</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setNewPerDay(course.lessonsPerDay || 2)
            setNewWeekdays(Array.isArray(course.weekdays) && course.weekdays.length ? [...course.weekdays] : [0, 1, 2, 3, 4, 5, 6])
            setPaceEditing(true)
          }}>改节奏</button>
        </div>
      </div>

      <div className="h1" style={{ wordBreak: 'break-word' }}>{course.title}</div>
      <div className="row gap-2 mt-2">
        <Chip kind={course.status === 'done' ? 'success' : (course.status === 'archived' ? 'default' : 'primary')}>
          {course.status === 'done' ? '已完成' : (course.status === 'archived' ? '已归档' : '在读')}
        </Chip>
        <Chip>{course.lessonsPerDay} 节/学习日</Chip>
        {Array.isArray(course.weekdays) && course.weekdays.length > 0 && course.weekdays.length < 7 && (
          <Chip kind="warning">{weekdaysText(course.weekdays)}</Chip>
        )}
      </div>

      <div className="card mt-3">
        <div className="row-between">
          <div className="text-soft text-sm">学习进度</div>
          <div className="text-sm">{stats.done} / {stats.total} 节</div>
        </div>
        <div className="mt-2"><ProgressBar value={stats.done} max={stats.total} /></div>
        <div className="mt-2 row gap-2 text-xs text-muted">
          <span>开始 {course.startDate}</span>
          <span>·</span>
          <span>计划完成 {course.plannedEndDate}</span>
        </div>
        {stats.overdue > 0 && (
          <div className="mt-2 text-xs text-warning">⚠ 逾期 {stats.overdue} 节</div>
        )}
      </div>

      {course.source && (
        <div className="card mt-3">
          <div className="text-xs text-muted">来源</div>
          <div className="text-sm mt-1" style={{ wordBreak: 'break-all' }}>{course.source}</div>
        </div>
      )}
      {course.note && (
        <div className="card mt-3">
          <div className="text-xs text-muted">备注</div>
          <MarkdownView source={course.note} />
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <span>时间线</span>
          <div className="row gap-2">
            {!selectMode ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectMode(true)}>批量</button>
                <button className="btn btn-primary btn-sm" onClick={exportNow}>导出 Markdown</button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedIds(
                    selectedIds.length > 0
                      ? []
                      : sortedLessons.filter(l => l.status !== 'done' && l.status !== 'skipped').map(l => l.id)
                  )}
                >
                  {selectedIds.length > 0 ? '取消全选' : '全选未完成'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={exitSelect}>退出</button>
              </>
            )}
          </div>
        </div>

        {dateKeys.length === 0 && skippedLessons.length === 0 && <EmptyState text="还没有分配计划" />}

        <div className="col gap-3">
          {dateKeys.map(date => {
            const day = byDate[date]
            const isToday = date === today
            const isPast = date < today
            return (
              <div key={date}>
                <div className="row-between mb-2">
                  <div className="text-xs text-muted">
                    {isToday ? '今天' : (isPast ? `${date} (已过)` : date)}
                  </div>
                  <div className="text-xs text-muted">{day.length} 节</div>
                </div>
                <div className="col gap-2">
                  {day.map(l => (
                    <LessonCard
                      key={l.id}
                      lesson={l}
                      courseTitle={course.title}
                      summary={!!summaryMap[l.id]?.content?.trim()}
                      overdue={isPast && l.status !== 'done'}
                      selectable={selectMode}
                      selected={selectedIds.includes(l.id)}
                      onToggleSelect={toggleSelect}
                      onDone={(lesson) => markDone(lesson)}
                      onSkip={(lesson) => doSkip([lesson.id])}
                      onRestore={(lesson) => doRestore([lesson.id])}
                      onEditSummary={(lesson) => startWrite(lesson, summaryMap[lesson.id]?.content?.trim() ? 'view' : 'write')}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {selectMode && (
          <div className="card mt-3" style={{ borderColor: 'var(--c-primary)' }}>
            <div className="text-sm text-soft mb-2">
              已选 {selectedIds.length} 节
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={busy || selectedIds.length === 0}
              onClick={() => doSkip(selectedIds)}
            >
              {busy ? '处理中…' : `跳过选中的 ${selectedIds.length} 节`}
            </button>
            <div className="text-xs text-muted mt-2">
              跳过后不再出现在今日待学,后面的任务会自动往前顶
            </div>
          </div>
        )}
      </div>

      {skippedLessons.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span>已跳过 ({skippedLessons.length} 节)</span>
          </div>
          <div className="col gap-2">
            {skippedLessons.map(l => (
              <LessonCard
                key={l.id}
                lesson={l}
                courseTitle={course.title}
                summary={!!summaryMap[l.id]?.content?.trim()}
                onRestore={(lesson) => doRestore([lesson.id])}
              />
            ))}
          </div>
          <div className="text-xs text-muted mt-2">
            跳过的节不在时间线内,取消跳过后按顺序排回计划
          </div>
        </div>
      )}

      <div className="section">
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={archiveCourse}>
          归档这门课
        </button>
        <button className="btn btn-danger mt-2" style={{ width: '100%' }} onClick={deleteThisCourse}>
          删除这门课
        </button>
      </div>

      <SummaryEditor
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
        lesson={editing?.lesson}
        savedContent={editing?.lesson ? summaryMap[editing.lesson.id]?.content || '' : ''}
        isEdit={!!editing?.isEdit}
      />

      <Modal open={paceEditing} onClose={() => setPaceEditing(false)} title="调整节奏">
        <div className="text-sm text-soft mb-3">
          调整后,未完成的节会从今天起重新分配;已完成的节保留原计划日期。
        </div>
        <label className="field-label">每个学习日几节</label>
        <input
          className="input"
          type="number"
          min={1} max={20}
          value={newPerDay}
          onChange={(e) => setNewPerDay(Number(e.target.value) || 1)}
        />
        <label className="field-label" style={{ marginTop: 16 }}>每周哪几天学</label>
        <WeekdayPicker value={newWeekdays} onChange={setNewWeekdays} />
        <div className="row gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setPaceEditing(false)} style={{ flex: 1 }}>取消</button>
          <button className="btn btn-primary" onClick={applyPace} style={{ flex: 1 }}>应用</button>
        </div>
      </Modal>

      <Modal open={startFromOpen} onClose={() => setStartFromOpen(false)} title="从哪一节课开始">
        <div className="text-sm text-soft mb-3">
          选中的这节课照常学;它前面<strong>还没学</strong>的课会全部跳过(已学完的不受影响)。
        </div>
        <div className="col gap-2" style={{ maxHeight: 264, overflowY: 'auto' }}>
          {sortedLessons.map(l => {
            const isActive = l.ordinal === startOrdinal
            const isDone = l.status === 'done'
            const isSkipped = l.status === 'skipped'
            return (
              <button
                key={l.id}
                className="btn btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  gap: 8,
                  ...(isActive ? { borderColor: 'var(--c-primary)', background: 'var(--c-primary-tint)' } : {})
                }}
                onClick={() => setStartOrdinal(l.ordinal)}
              >
                <span className={`check ${isActive ? 'checked' : ''}`} aria-hidden style={{ width: 18, height: 18, fontSize: 12 }}>
                  {isActive && '✓'}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  第 {l.ordinal} 节 · {l.title}
                </span>
                {isDone && <span className="text-xs text-muted">已学完</span>}
                {!isDone && isSkipped && <span className="text-xs text-muted">已跳过</span>}
                {!isDone && !isSkipped && <span className="text-xs text-muted">待学</span>}
              </button>
            )
          })}
        </div>
        <div className="text-xs text-muted mt-3">
          {startOrdinal <= 1
            ? '从第 1 节开始,没有要跳过的课'
            : `将跳过前 ${startOrdinal - 1} 节中还没学的 ${startFromSkipCount} 节,其余任务从今天起重新排`}
        </div>
        <div className="row gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setStartFromOpen(false)} style={{ flex: 1 }}>取消</button>
          <button
            className="btn btn-primary"
            onClick={applyStartFrom}
            style={{ flex: 1 }}
            disabled={busy || startFromSkipCount === 0}
          >
            {busy ? '处理中…' : (startFromSkipCount > 0 ? `跳过 ${startFromSkipCount} 节并开始` : '无需跳过')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
