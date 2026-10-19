import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.js'
import EmptyState from '../components/EmptyState.jsx'
import MarkdownView from '../components/MarkdownView.jsx'
import SummaryEditor from '../components/SummaryEditor.jsx'
import Chip from '../components/Chip.jsx'
import { exportMultiCoursesAsMarkdown } from '../utils/exportMarkdown.js'
import { downloadText, safeFilename } from '../utils/download.js'
import { useFeedbackFx } from '../utils/feedback.js'

export default function Notes() {
  const courses = useLiveQuery(() => db.courses.toArray(), [], [])
  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [])
  const summaries = useLiveQuery(() => db.summaries.toArray(), [], [])
  const summaryMap = useMemo(() => {
    const m = {}
    for (const s of summaries) m[s.lessonId] = s
    return m
  }, [summaries])

  const [preview, setPreview] = useState(null) // { courseId }
  const [search, setSearch] = useState('')
  const [exportMode, setExportMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [editing, setEditing] = useState(null) // 改总结用
  const pushToast = useFeedbackFx((s) => s.pushToast)

  const courseStats = useMemo(() => {
    const m = {}
    for (const c of courses) {
      const cls = lessons.filter(l => l.courseId === c.id)
      const doneCount = cls.filter(l => l.status === 'done').length
      const summarizedCount = cls.filter(l => summaryMap[l.id]?.content?.trim()).length
      m[c.id] = { total: cls.length, doneCount, summarizedCount }
    }
    return m
  }, [courses, lessons, summaryMap])

  const filteredCourses = useMemo(() => {
    return courses.filter(c => courseStats[c.id]?.summarizedCount > 0)
  }, [courses, courseStats])

  const previewCourse = useMemo(() => {
    if (!preview) return null
    return courses.find(c => c.id === preview.courseId)
  }, [preview, courses])

  const previewLessons = useMemo(() => {
    if (!preview) return []
    const arr = lessons.filter(l => l.courseId === preview.courseId)
    arr.sort((a, b) => a.ordinal - b.ordinal)
    if (!search.trim()) return arr.filter(l => summaryMap[l.id]?.content?.trim())
    const q = search.toLowerCase()
    return arr.filter(l => {
      const s = summaryMap[l.id]?.content || ''
      return s.toLowerCase().includes(q) || l.title.toLowerCase().includes(q)
    })
  }, [preview, lessons, summaryMap, search])

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function exportSelected() {
    if (selected.size === 0) { pushToast('至少选一门课'); return }
    try {
      const md = await exportMultiCoursesAsMarkdown([...selected])
      const fname = `${safeFilename('合集')}_${new Date().toISOString().slice(0, 10)}.md`
      downloadText(md, fname, 'text/markdown')
      pushToast('导出成功')
    } catch {
      pushToast('导出失败')
    }
    setExportMode(false)
    setSelected(new Set())
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="h1">笔记</div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setExportMode(e => !e); setSelected(new Set()) }}>
          {exportMode ? '取消' : '多课导出'}
        </button>
      </div>

      {!preview && (
        <>
          {filteredCourses.length === 0 && (
            <EmptyState icon="📓" text="还没有写下的总结">
              <Link to="/" className="btn btn-primary btn-sm">去学一节</Link>
            </EmptyState>
          )}

          <div className="col gap-3">
            {filteredCourses.map(c => (
              <div
                key={c.id}
                className="card"
                onClick={() => {
                  if (exportMode) { toggle(c.id); return }
                  setPreview({ courseId: c.id })
                }}
                style={{ cursor: 'pointer', borderColor: exportMode && selected.has(c.id) ? 'var(--c-primary)' : undefined }}
              >
                <div className="row-between">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="h3" style={{ wordBreak: 'break-word' }}>{c.title}</div>
                    <div className="row gap-2 mt-2 text-xs text-muted">
                      <Chip kind="primary">{courseStats[c.id].summarizedCount} 节已总结</Chip>
                      <span>·</span>
                      <span>共 {courseStats[c.id].total} 节</span>
                    </div>
                  </div>
                  {exportMode && (
                    <div className={`check ${selected.has(c.id) ? 'checked' : ''}`}>
                      {selected.has(c.id) && '✓'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {exportMode && (
            <div className="row gap-2 mt-4">
              <button className="btn btn-secondary" onClick={() => setExportMode(false)} style={{ flex: 1 }}>取消</button>
              <button className="btn btn-primary" onClick={exportSelected} style={{ flex: 1 }}>
                导出 {selected.size} 门课
              </button>
            </div>
          )}
        </>
      )}

      {preview && previewCourse && (
        <>
          <div className="page-header">
            <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>← 课库</button>
            <div className="h2" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewCourse.title}</div>
            <Link to={`/course/${preview.courseId}`} className="btn btn-ghost btn-sm">课程详情</Link>
          </div>

          <input
            className="input"
            placeholder="搜索总结内容或标题..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="section">
            {previewLessons.length === 0 && (
              <EmptyState text={search ? '搜索无结果' : '这门课还没有总结'} />
            )}
            {previewLessons.map(l => {
              const s = summaryMap[l.id]?.content || ''
              return (
                <div key={l.id} className="card mb-3">
                  <div className="row-between">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-xs text-muted">第 {l.ordinal} 节</div>
                      <div className="h3">{l.title}</div>
                    </div>
                    {s.trim() && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditing({
                          lesson: {
                            id: l.id, ordinal: l.ordinal, title: l.title,
                            courseTitle: previewCourse.title
                          },
                          isEdit: true,
                          alreadyDone: l.status === 'done'
                        })}
                      >
                        改总结
                      </button>
                    )}
                  </div>
                  <div className="mt-3">
                    <MarkdownView source={s || '*[未总结]*'} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <SummaryEditor
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); pushToast('总结已更新') }}
        lesson={editing?.lesson}
        savedContent={editing?.lesson ? summaryMap[editing.lesson.id]?.content || '' : ''}
        isEdit={!!editing?.isEdit}
      />
    </div>
  )
}
