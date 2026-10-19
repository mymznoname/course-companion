import { Link } from 'react-router-dom'
import ProgressBar from './ProgressBar.jsx'
import Chip from './Chip.jsx'
import { weekdaysText } from './WeekdayPicker.jsx'

/**
 * 课程进度卡片
 * Props:
 *   course: { id, title, totalLessons, lessonsPerDay, status, plannedEndDate, createdAt }
 *   stats: { doneCount, pendingCount, overdueCount }
 */
export default function CourseCard({ course, stats }) {
  const pct = stats ? (stats.doneCount / course.totalLessons) * 100 : 0
  const isOverdue = stats?.overdueCount > 0
  const isDone = course.status === 'done'
  const isArchived = course.status === 'archived'

  return (
    <Link to={`/course/${course.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card card-stack" style={{ display: 'block', cursor: 'pointer' }}>
        <div className="row-between">
          <div className="h3" style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {course.title}
          </div>
          {isDone && <Chip kind="success">已完成</Chip>}
          {isArchived && <Chip>已归档</Chip>}
          {!isDone && !isArchived && stats?.pendingCount > 0 && (
            <Chip kind="primary">在学</Chip>
          )}
        </div>
        <div className="mt-2 text-sm text-soft">
          {stats?.doneCount ?? 0} / {course.totalLessons} 节 · {course.lessonsPerDay} 节/学习日
          {Array.isArray(course.weekdays) && course.weekdays.length > 0 && course.weekdays.length < 7
            ? ` · ${weekdaysText(course.weekdays)}`
            : ''}
        </div>
        <div className="mt-2">
          <ProgressBar value={stats?.doneCount ?? 0} max={course.totalLessons} />
        </div>
        <div className="mt-2 row gap-2 text-xs text-muted">
          {isOverdue && !isDone && (
            <span className="text-warning">⚠ 逾期 {stats.overdueCount} 节</span>
          )}
          {!isDone && course.plannedEndDate && (
            <span>计划于 {course.plannedEndDate} 前完成</span>
          )}
          {isDone && course.finishedAt && (
            <span>完成于 {course.finishedAt.slice(0, 10)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
