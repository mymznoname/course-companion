import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.js'
import CourseCard from '../components/CourseCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { toDateStr } from '../db/scheduler.js'
import { syncCourseStatus } from '../db/courses.js'

export default function Library() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('active') // active | done | archived
  const courses = useLiveQuery(() => db.courses.toArray(), [], [])
  const lessonsAll = useLiveQuery(() => db.lessons.toArray(), [], [])
  const today = toDateStr(new Date())

  const stats = useMemo(() => {
    const m = {}
    for (const c of courses) {
      const cls = lessonsAll.filter(l => l.courseId === c.id)
      const doneCount = cls.filter(l => l.status === 'done').length
      const pendingCount = cls.filter(l => l.status !== 'done').length
      const overdueCount = cls.filter(l => l.plannedDate && l.plannedDate < today && l.status !== 'done').length
      m[c.id] = { doneCount, pendingCount, overdueCount, total: cls.length }
    }
    return m
  }, [courses, lessonsAll, today])

  const filtered = useMemo(() => {
    return courses
      .filter(c => c.status === tab)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [courses, tab])

  const counts = useMemo(() => ({
    active: courses.filter(c => c.status === 'active').length,
    done: courses.filter(c => c.status === 'done').length,
    archived: courses.filter(c => c.status === 'archived').length
  }), [courses])

  return (
    <div className="page">
      <div className="page-header">
        <div className="h1">课库</div>
        <Link to="/library/new" className="btn btn-primary btn-sm">+ 添加课程</Link>
      </div>

      <div className="row gap-2 mb-3">
        {[
          ['active', '在读', counts.active],
          ['done', '已完成', counts.done],
          ['archived', '归档', counts.archived]
        ].map(([k, label, n]) => (
          <button
            key={k}
            className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(k)}
          >
            {label} ({n})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={tab === 'active' ? '🎓' : '📦'}
          text={tab === 'active' ? '还没添加课程' : `还没有${tab === 'done' ? '已完成' : '归档'}的课`}
        >
          {tab === 'active' && (
            <Link to="/library/new" className="btn btn-primary">添加一门课</Link>
          )}
        </EmptyState>
      )}

      <div className="col gap-3">
        {filtered.map(c => (
          <CourseCard
            key={c.id}
            course={c}
            stats={stats[c.id]}
          />
        ))}
      </div>
    </div>
  )
}
