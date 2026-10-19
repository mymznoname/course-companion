// 学习数据统计(纯函数,可单测)
// 数据来源:lessons(status/completedAt)、summaries(content)、courses
import { format, subDays, parseISO, differenceInCalendarDays, startOfWeek, addDays } from 'date-fns'
import { scheduleLessons } from '../db/scheduler.js'

const DAY = 'yyyy-MM-dd'

function dayOf(isoOrDate) {
  return typeof isoOrDate === 'string' ? isoOrDate.slice(0, 10) : format(isoOrDate, DAY)
}

/** 每天学完节数:{ '2026-10-17': 3, ... } */
export function doneCountByDay(lessons) {
  const m = {}
  for (const l of lessons) {
    if (l.status !== 'done' || !l.completedAt) continue
    const d = l.completedAt.slice(0, 10)
    m[d] = (m[d] || 0) + 1
  }
  return m
}

/**
 * 连续学习天数。今天没学不断(从昨天往前数),昨天也没学 = 0。
 */
export function computeStreak(lessons, todayStr) {
  const days = doneCountByDay(lessons)
  let cursor = todayStr
  if (!days[cursor]) {
    cursor = format(subDays(parseISO(todayStr), 1), DAY)
    if (!days[cursor]) return 0
  }
  let streak = 0
  while (days[cursor]) {
    streak++
    cursor = format(subDays(parseISO(cursor), 1), DAY)
  }
  return streak
}

/**
 * 热力图数据:最近 N 周(默认 16),按周一起排
 * @returns {{weeks: number, days: Array<{date:string, count:number, future:boolean}>}}
 */
export function heatmapData(lessons, todayStr, weeks = 16) {
  const counts = doneCountByDay(lessons)
  const today = parseISO(todayStr)
  // 从本周周一往前推 weeks-1 周
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 })
  const start = addDays(thisMonday, -(weeks - 1) * 7)
  const days = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i)
    const key = format(d, DAY)
    days.push({ date: key, count: counts[key] || 0, future: d > today })
  }
  return { weeks, days }
}

/** 本周(周一起)每天的学完节数,长度 7 */
export function thisWeekCounts(lessons, todayStr) {
  const counts = doneCountByDay(lessons)
  const monday = startOfWeek(parseISO(todayStr), { weekStartsOn: 1 })
  const out = []
  for (let i = 0; i < 7; i++) {
    const key = format(addDays(monday, i), DAY)
    out.push({ date: key, count: counts[key] || 0 })
  }
  return out
}

/** 本周 vs 上周学完节数 */
export function weekCompare(lessons, todayStr) {
  const counts = doneCountByDay(lessons)
  const monday = startOfWeek(parseISO(todayStr), { weekStartsOn: 1 })
  const lastMonday = addDays(monday, -7)
  let thisWeek = 0, lastWeek = 0
  for (let i = 0; i < 7; i++) {
    thisWeek += counts[format(addDays(monday, i), DAY)] || 0
    lastWeek += counts[format(addDays(lastMonday, i), DAY)] || 0
  }
  return { thisWeek, lastWeek, diff: thisWeek - lastWeek }
}

/** 总结总字数 */
export function totalWords(summaries) {
  return (summaries || []).reduce((s, x) => s + ((x.content || '').trim().length), 0)
}

/**
 * 单门课的健康度
 * @returns {{remaining, perDay, projectedFinish, daysBehind, overdueCount, status}}
 *   status: 'done' | 'behind' | 'ontrack'
 */
export function courseHealth(course, lessons, todayStr) {
  const cls = lessons.filter(l => l.courseId === course.id)
  const doneCount = cls.filter(l => l.status === 'done').length
  const skippedCount = cls.filter(l => l.status === 'skipped').length
  const active = cls.filter(l => l.status !== 'done' && l.status !== 'skipped')
  const overdueCount = active.filter(l => l.plannedDate && l.plannedDate < todayStr).length

  if (active.length === 0) {
    return { doneCount, total: cls.length, remaining: 0, perDay: course.lessonsPerDay, projectedFinish: null, daysBehind: 0, overdueCount, status: 'done' }
  }

  // 用真实排期算预计完成日(自动处理周末 1.5x 和"每周哪几天学")
  const plan = scheduleLessons({
    lessons: active.map(l => ({ ordinal: l.ordinal, title: l.title })),
    lessonsPerDay: course.lessonsPerDay || 1,
    weekendBoosted: !!course.weekendBoosted,
    weekdays: course.weekdays || null,
    startDate: todayStr,
    today: todayStr
  })
  const projectedFinish = plan.length ? plan[plan.length - 1].plannedDate : null
  let daysBehind = 0
  if (projectedFinish && course.plannedEndDate) {
    daysBehind = differenceInCalendarDays(parseISO(projectedFinish), parseISO(course.plannedEndDate))
  }
  return {
    doneCount, total: cls.length,
    remaining: active.length,
    perDay: course.lessonsPerDay || 1,
    projectedFinish,
    daysBehind: Math.max(0, daysBehind),
    overdueCount,
    status: daysBehind > 0 ? 'behind' : 'ontrack'
  }
}

/** 本周一句话报告 */
export function weekSentence(lessons, todayStr) {
  const { thisWeek, lastWeek, diff } = weekCompare(lessons, todayStr)
  const streak = computeStreak(lessons, todayStr)
  const parts = [`本周学了 ${thisWeek} 节`]
  if (lastWeek > 0) {
    parts.push(diff >= 0 ? `比上周多 ${diff} 节` : `比上周少 ${-diff} 节`)
  }
  if (streak >= 2) parts.push(`已连续 ${streak} 天`)
  return parts.join(',') + '。'
}
