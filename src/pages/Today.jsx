import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.js'
import { getTodayLessons, toDateStr } from '../db/scheduler.js'
import { skipLessons, restoreLessons } from '../db/skipPlan.js'
import { scheduleReviews, markLessonReviewed } from '../db/reviews.js'
import EmptyState from '../components/EmptyState.jsx'
import CourseCard from '../components/CourseCard.jsx'
import XpBar from '../components/XpBar.jsx'
import LessonCard from '../components/LessonCard.jsx'
import SummaryEditor from '../components/SummaryEditor.jsx'
import { useProfile } from '../store/profile.js'
import { useFeedbackFx, fireLessonDoneFx, fireCourseDoneFx, fireLevelUpFx, fireBadgeFx } from '../utils/feedback.js'
import { syncCourseStatus } from '../db/courses.js'

export default function Today() {
  const today = toDateStr(new Date())
  const dateObj = new Date()
  const dateLabel = format(dateObj, 'M月d日 EEEE', { locale: zhCN })
  const courses = useLiveQuery(() => db.courses.toArray(), [], [])
  const lessonsAll = useLiveQuery(() => db.lessons.toArray(), [], [])
  const summaries = useLiveQuery(() => db.summaries.toArray(), [], [])
  const summaryMap = useMemo(() => {
    const m = {}
    for (const s of summaries) m[s.lessonId] = s
    return m
  }, [summaries])

  const feedbackTier = useProfile((s) => s.feedbackTier)
  const addXp = useProfile((s) => s.addXp)
  const unlockBadge = useProfile((s) => s.unlockBadge)
  const settings = useProfile((s) => s.settings)
  const pushToast = useFeedbackFx((s) => s.pushToast)
  const triggerConfetti = useFeedbackFx((s) => s.triggerConfetti)

  const [editing, setEditing] = useState(null) // { lesson, mode: 'write' | 'view' }
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([]) // number[]
  const [busy, setBusy] = useState(false)

  // 今日待学任务(已跳过的不出现;当天没学完的会顺延上来)
  const todayLessons = useMemo(() => {
    if (!lessonsAll.length) return []
    return getTodayLessons(lessonsAll, today)
  }, [lessonsAll, today])

  // 拆成两组:逾期顺延的 + 今天新排的
  const carriedOver = useMemo(() => todayLessons.filter(l => l.plannedDate < today), [todayLessons, today])
  const todayNew = useMemo(() => todayLessons.filter(l => l.plannedDate === today), [todayLessons, today])

  function renderLessonCard(lesson) {
    const course = courses.find(c => c.id === lesson.courseId)
    return (
      <LessonCard
        key={lesson.id}
        lesson={lesson}
        courseTitle={course?.title || '?'}
        summary={!!summaryMap[lesson.id]?.content?.trim()}
        overdue={lesson.plannedDate < today}
        selectable={selectMode}
        selected={selectedIds.includes(lesson.id)}
        onToggleSelect={toggleSelect}
        onDone={(l) => markDone(l, course)}
        onSkip={(l) => skip(l)}
        onEditSummary={(l) => editSavedSummary(l, course)}
      />
    )
  }

  // 今天已完成的节(学完就从「今日待学」消失,单独列出来方便改总结)
  const todayDone = useMemo(() => {
    return lessonsAll
      .filter(l => l.plannedDate === today && l.status === 'done')
      .sort((a, b) => (a.orderInDay || 0) - (b.orderInDay || 0))
  }, [lessonsAll, today])

  // 已跳过的节(全部课程,可恢复)
  const skippedLessons = useMemo(() => {
    return lessonsAll
      .filter(l => l.status === 'skipped')
      .sort((a, b) => {
        if (a.courseId !== b.courseId) return a.courseId - b.courseId
        return a.ordinal - b.ordinal
      })
  }, [lessonsAll])

  // 今日回顾(到期的复习点按课合并,含错过的)
  const reviewsAll = useLiveQuery(() => db.reviews.toArray(), [], [])
  const [expandedReview, setExpandedReview] = useState(null)
  const dueReviews = useMemo(() => {
    if (!settings.reviewEnabled || !reviewsAll.length || !lessonsAll.length) return []
    const due = reviewsAll.filter(r => !r.doneAt && r.dueDate <= today)
    // 同一节课的多个到期点合并成一张卡(点「已回顾」一次全清)
    const byLesson = new Map()
    for (const r of due) {
      const lesson = lessonsAll.find(l => l.id === r.lessonId)
      if (!lesson) continue
      if (!byLesson.has(lesson.id)) {
        byLesson.set(lesson.id, {
          lessonId: lesson.id,
          lesson,
          course: courses.find(c => c.id === lesson.courseId),
          count: 0
        })
      }
      byLesson.get(lesson.id).count++
    }
    return [...byLesson.values()].sort((a, b) => {
      if (a.lesson.courseId !== b.lesson.courseId) return a.lesson.courseId - b.lesson.courseId
      return a.lesson.ordinal - b.lesson.ordinal
    })
  }, [reviewsAll, lessonsAll, courses, today, settings.reviewEnabled])

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
    const ids = lessonIds || []
    if (!ids.length) { pushToast('先选中要跳过的节'); return }
    setBusy(true)
    try {
      await skipLessons(ids, today)
      pushToast(`已跳过 ${ids.length} 节,后面的任务已往前顶`)
      exitSelect()
    } catch (e) {
      pushToast('操作失败:' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function doRestore(lessonIds) {
    const ids = lessonIds || []
    if (!ids.length) return
    setBusy(true)
    try {
      await restoreLessons(ids, today)
      pushToast(`已恢复 ${ids.length} 节`)
    } catch (e) {
      pushToast('操作失败:' + e.message)
    } finally {
      setBusy(false)
    }
  }

  // 在学的课(用于底部总览)
  const activeCourses = useMemo(() => courses.filter(c => c.status === 'active'), [courses])

  // 到点且还有事没做 → 应用内横幅(软件开着时的提醒)
  const [nowHM, setNowHM] = useState(() => {
    const d = new Date()
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  })
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date()
      setNowHM(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'))
    }, 30000)
    return () => clearInterval(t)
  }, [])
  const reminderDue = !!settings.reminderEnabled
    && nowHM >= (settings.reminderTime || '22:00')
    && (todayLessons.length > 0 || dueReviews.length > 0)

  // ===== 状态同步给服务器(每日提醒用:服务器读不到 IndexedDB)=====
  useEffect(() => {
    if (!settings.reminderEnabled) return
    const payload = {
      date: today,
      pendingCount: todayLessons.length,
      activeCount: activeCourses.length,
      reviewDueCount: dueReviews.length,
      reminderEnabled: !!settings.reminderEnabled,
      reminderTime: settings.reminderTime || '22:00'
    }
    fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => { /* 服务器没开,静默 */ })
  }, [todayLessons.length, dueReviews.length, activeCourses.length, settings.reminderEnabled, settings.reminderTime, today])
  const doneCourses = useMemo(() => courses.filter(c => c.status === 'done'), [courses])

  // 每课统计
  const stats = useMemo(() => {
    const m = {}
    for (const c of courses) {
      const cls = lessonsAll.filter(l => l.courseId === c.id)
      const doneCount = cls.filter(l => l.status === 'done').length
      const pendingCount = cls.filter(l => l.status === 'pending' || l.status === 'learning' || l.status === 'skipped').length
      const overdueCount = cls.filter(l => l.plannedDate < today && l.status !== 'done').length
      m[c.id] = { doneCount, pendingCount, overdueCount, total: cls.length }
    }
    return m
  }, [courses, lessonsAll, today])

  // 打开总结编辑器(可能在 Today 页直接触发)
  function startEdit(lesson, course, mode = 'write') {
    setEditing({
      lesson: {
        id: lesson.id,
        ordinal: lesson.ordinal,
        title: lesson.title,
        courseTitle: course?.title
      },
      // 是否在改一份已存在的总结 + 这节课是否已打卡 —— 决定保存后要不要再走一遍打卡流程
      isEdit: !!summaryMap[lesson.id]?.content?.trim(),
      alreadyDone: lesson.status === 'done',
      mode
    })
  }

  async function markDone(lesson, course) {
    // 强制:没有总结就不让打卡
    const hasSummary = summaryMap[lesson.id]?.content?.trim()
    if (!hasSummary) {
      startEdit(lesson, course, 'write')
      pushToast('先写下这节的总结再打卡哦')
      return
    }

    // 已写完总结,直接打卡
    await db.lessons.update(lesson.id, {
      status: 'done',
      completedAt: new Date().toISOString()
    })

    // 生成复习点(按设定的间隔)
    if (settings.reviewEnabled) {
      await scheduleReviews(lesson.id, settings.reviewIntervals, today)
    }

    // 反馈 + XP
    fireLessonDoneFx(feedbackTier, pushToast, triggerConfetti)
    const { leveledUp, level } = await addXp(feedbackTier === 'game' ? 10 : 5)
    if (leveledUp) fireLevelUpFx(level, feedbackTier, pushToast, triggerConfetti)

    // 课程首次完成一节 -> 解锁 first-lesson 徽章
    const doneCount = lessonsAll.filter(l => l.courseId === lesson.courseId && l.status === 'done').length + 1
    if (doneCount === 1) {
      const ok = await unlockBadge('first_lesson')
      if (ok) fireBadgeFx('首节突破', feedbackTier, pushToast)
    }
    if (doneCount === 10) {
      const ok = await unlockBadge('ten_lessons')
      if (ok) fireBadgeFx('十节达成', feedbackTier, pushToast)
    }

    // 检查课程是否全部完成
    const remaining = await db.lessons
      .where('courseId').equals(lesson.courseId)
      .filter(l => l.status !== 'done')
      .count()
    if (remaining === 0) {
      await syncCourseStatus(lesson.courseId, 'done')
      fireCourseDoneFx(feedbackTier, course.title, pushToast, triggerConfetti)
    }
  }

  async function skip(lesson) {
    await doSkip([lesson.id])
  }

  function editSavedSummary(lesson, course) {
    const hasSummary = summaryMap[lesson.id]
    if (!hasSummary) {
      startEdit(lesson, course, 'write')
      return
    }
    setEditing({
      lesson: {
        id: lesson.id,
        ordinal: lesson.ordinal,
        title: lesson.title,
        courseTitle: course?.title
      },
      isEdit: true,
      alreadyDone: lesson.status === 'done',
      mode: 'view'
    })
  }

  /**
   * 总结编辑器保存后的回调。
   * 只有「第一次给一节课写总结、且这节课还没打卡」时才走打卡流程
   * (加 XP、标记完成、排复习)。
   * 改已有总结 → 只更新内容,不重复发 XP,也不覆盖原始完成日期。
   */
  async function handleEditorSaved() {
    const lessonId = editing?.lesson?.id
    if (!lessonId) { setEditing(null); return }

    // 纯修改:什么都不触发,提示一下就好
    if (editing?.isEdit || editing?.alreadyDone) {
      setEditing(null)
      pushToast('总结已更新')
      return
    }

    const lesson = lessonsAll.find(l => l.id === lessonId)
    const course = lesson && courses.find(c => c.id === lesson.courseId)
    if (lesson && course) {
      // 自动打卡
      await db.lessons.update(lesson.id, {
        status: 'done',
        completedAt: new Date().toISOString()
      })
      // 生成复习点
      if (settings.reviewEnabled) {
        await scheduleReviews(lesson.id, settings.reviewIntervals, today)
      }
      const { leveledUp, level } = await addXp(feedbackTier === 'game' ? 10 : 5)
      fireLessonDoneFx(feedbackTier, pushToast, triggerConfetti)
      if (leveledUp) fireLevelUpFx(level, feedbackTier, pushToast, triggerConfetti)

      const doneCount = await db.lessons
        .where('courseId').equals(lesson.courseId)
        .filter(l => l.status === 'done')
        .count()
      if (doneCount === 1) {
        const ok = await unlockBadge('first_lesson')
        if (ok) fireBadgeFx('首节突破', feedbackTier, pushToast)
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
    setEditing(null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="text-muted text-xs">{dateLabel}</div>
          <div className="h1 mt-1">{todayLessons.length > 0 ? '今天该学这些' : '今天没有任务'}</div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--c-primary-tint)', borderColor: 'transparent' }}>
        <XpBar />
      </div>

      {reminderDue && (
        <div className="card mt-3" style={{ borderColor: 'var(--c-warning, #BA7517)' }}>
          <div className="row gap-2">
            <div style={{ fontSize: 20 }}>⏰</div>
            <div style={{ flex: 1 }}>
              <div className="h3">到点了,还有事没做完</div>
              <div className="text-sm text-soft">
                今天还有 {todayLessons.length} 节课没记录{dueReviews.length > 0 && `,${dueReviews.length} 节待回顾`}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeCourses.length === 0 && doneCourses.length === 0 && (
        <div className="mt-4">
          <EmptyState icon="🎓" text="还没添加课程">
            <Link to="/library/new" className="btn btn-primary">添加一门课</Link>
          </EmptyState>
        </div>
      )}

      {dueReviews.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span>今日回顾 ({dueReviews.length})</span>
          </div>
          <div className="text-xs text-muted mb-2">
            学完这几节已经过了一段时间,看一遍当时的总结,记住了就标记「已回顾」
          </div>
          <div className="col gap-2">
            {dueReviews.map(({ lesson, course, count }) => {
              const summary = summaryMap[lesson.id]
              const daysAgo = Math.max(0, Math.round((new Date(today) - new Date(lesson.completedAt?.slice(0, 10) || today)) / 864e5))
              const expanded = expandedReview === lesson.id
              return (
                <div key={lesson.id} className="card" style={{ padding: 14 }}>
                  <div className="row-between">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-xs text-muted">
                        {course?.title || '?'} · 第 {lesson.ordinal} 节 · 学完 {daysAgo} 天前{count > 1 ? ` · ${count} 个复习点` : ''}
                      </div>
                      <div className="h3 mt-1" style={{ wordBreak: 'break-word' }}>{lesson.title}</div>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="mt-2 text-sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {summary?.content?.trim() || '(没有找到总结)'}
                    </div>
                  ) : (
                    <div className="text-sm text-soft mt-1" style={{
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', whiteSpace: 'pre-wrap'
                    }}>
                      {summary?.content?.trim() || '(没有找到总结)'}
                    </div>
                  )}
                  <div className="row gap-2 mt-3">
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => setExpandedReview(expanded ? null : lesson.id)}
                    >
                      {expanded ? '收起' : '看总结'}
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                      onClick={async () => {
                        await markLessonReviewed(lesson.id)
                        setExpandedReview(null)
                      }}
                    >
                      已回顾
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {todayLessons.length === 0 && activeCourses.length > 0 && (
        <div className="card mt-3" style={{ background: 'var(--c-primary-tint)', borderColor: 'transparent' }}>
          <div className="row gap-2">
            <div style={{ fontSize: 22 }}>✦</div>
            <div>
              <div className="h3">今天的任务都清空了</div>
              <div className="text-sm text-soft">休息一下,或者去课库看看还要多久学完</div>
            </div>
          </div>
        </div>
      )}

      {(carriedOver.length > 0 || todayNew.length > 0) && (
        <div className="section">
          <div className="section-title">
            <span>今天的任务 ({todayLessons.length} 节)</span>
            {!selectMode ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectMode(true)}>
                批量
              </button>
            ) : (
              <div className="row gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedIds(
                    selectedIds.length === todayLessons.length ? [] : todayLessons.map(l => l.id)
                  )}
                >
                  {selectedIds.length === todayLessons.length ? '取消全选' : '全选'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={exitSelect}>退出</button>
              </div>
            )}
          </div>

          {carriedOver.length > 0 && (
            <>
              <div className="text-xs text-warning mt-1 mb-2">
                逾期未学 {carriedOver.length} 节:之前没学完、顺延到今天的,学完或跳过才消失
              </div>
              <div className="col gap-3">
                {carriedOver.map(lesson => renderLessonCard(lesson))}
              </div>
            </>
          )}

          {todayNew.length > 0 && (
            <>
              <div className="text-xs text-muted mt-3 mb-2">今日新任务 {todayNew.length} 节</div>
              <div className="col gap-3">
                {todayNew.map(lesson => renderLessonCard(lesson))}
              </div>
            </>
          )}

          {selectMode && (
            <div className="card mt-3" style={{ borderColor: 'var(--c-primary)' }}>
              <div className="text-sm text-soft mb-2">
                已选 {selectedIds.length} / {todayLessons.length} 节
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
      )}

      {todayDone.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span>今天已完成 ({todayDone.length} 节)</span>
          </div>
          <div className="text-xs text-muted mb-2">
            刚学完的节会从「今日待学」里消失,想改总结从这里进
          </div>
          <div className="col gap-2">
            {todayDone.map(lesson => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                courseTitle={courses.find(c => c.id === lesson.courseId)?.title || '?'}
                summary={!!summaryMap[lesson.id]?.content?.trim()}
                onEditSummary={(l) => editSavedSummary(l, courses.find(c => c.id === l.courseId))}
              />
            ))}
          </div>
        </div>
      )}

      {skippedLessons.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span>已跳过 ({skippedLessons.length} 节)</span>
          </div>
          <div className="col gap-2">
            {skippedLessons.map(lesson => {
              const course = courses.find(c => c.id === lesson.courseId)
              return (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  courseTitle={course?.title || '?'}
                  summary={!!summaryMap[lesson.id]?.content?.trim()}
                  onRestore={(l) => doRestore([l.id])}
                />
              )
            })}
          </div>
        </div>
      )}

      {(activeCourses.length > 0 || doneCourses.length > 0) && (
        <div className="section">
          <div className="section-title">
            <span>在学的课</span>
            <Link to="/library" className="text-primary text-xs">全部 →</Link>
          </div>
          <div className="col gap-3">
            {activeCourses.map(c => (
              <CourseCard key={c.id} course={c} stats={stats[c.id]} />
            ))}
          </div>
        </div>
      )}

      <SummaryEditor
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={handleEditorSaved}
        lesson={editing?.lesson}
        savedContent={editing?.lesson ? summaryMap[editing.lesson.id]?.content || '' : ''}
        isEdit={!!editing?.isEdit}
      />
    </div>
  )
}
