// 课程笔记导出 — Markdown 字符串拼装(纯字符串,不依赖 marked)
import { db } from '../db/index.js'

/**
 * 生成某课的 Markdown 笔记
 * @param {number} courseId
 * @returns {Promise<string>}
 */
export async function exportCourseAsMarkdown(courseId) {
  const course = await db.courses.get(courseId)
  if (!course) throw new Error('课程不存在')

  const lessons = await db.lessons
    .where('courseId').equals(courseId)
    .toArray()
  lessons.sort((a, b) => a.ordinal - b.ordinal)

  const summaries = await db.summaries
    .where('lessonId').anyOf(lessons.map(l => l.id))
    .toArray()
  const summaryMap = {}
  for (const s of summaries) summaryMap[s.lessonId] = s

  const lines = []

  // 标题
  lines.push(`# ${course.title}`)
  lines.push('')

  // 元信息
  lines.push(`> 开始:${course.startDate || '未设定'}  |  计划结束:${course.plannedEndDate || '进行中'}  |  实际完成:${course.finishedAt ? course.finishedAt.slice(0, 10) : '进行中'}`)
  lines.push('')
  lines.push(`- 总节数:${course.totalLessons}`)
  lines.push(`- 每天学习:${course.lessonsPerDay} 节${course.weekendBoosted ? ' (周末 ×1.5)' : ''}`)
  if (course.source) lines.push(`- 来源:${course.source}`)
  if (course.note) lines.push(`- 备注:${course.note}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // 每节总结
  for (const lesson of lessons) {
    lines.push(`## ${lesson.ordinal}. ${lesson.title}`)
    lines.push('')
    const summary = summaryMap[lesson.id]
    if (summary && summary.content?.trim()) {
      lines.push(summary.content.trim())
    } else {
      lines.push('*[未总结]*')
    }
    if (lesson.completedAt) {
      lines.push('')
      lines.push(`<sub>学完于 ${lesson.completedAt.slice(0, 10)}</sub>`)
    }
    lines.push('')
  }

  // 学习时间线
  lines.push('---')
  lines.push('')
  lines.push('## 📅 学习时间线')
  lines.push('')
  const grouped = {}
  for (const l of lessons) {
    if (!l.plannedDate) continue
    if (!grouped[l.plannedDate]) grouped[l.plannedDate] = []
    grouped[l.plannedDate].push(l)
  }
  const dates = Object.keys(grouped).sort()
  for (const d of dates) {
    const day = grouped[d]
    const done = day.filter(x => x.status === 'done').length
    const skipped = day.filter(x => x.status === 'skipped').length
    const total = day.length
    lines.push(`- **${d}**: ${done}/${total}${skipped ? ` (跳过 ${skipped})` : ''}`)
  }

  return lines.join('\n')
}

/**
 * 多课合并导出
 * @param {number[]} courseIds
 */
export async function exportMultiCoursesAsMarkdown(courseIds) {
  const parts = []
  for (const id of courseIds) {
    const m = await exportCourseAsMarkdown(id)
    parts.push(m)
  }
  return parts.join('\n\n---\n\n# 下一门课\n\n')
}
