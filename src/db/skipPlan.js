// 跳过 / 恢复跳过的数据操作
//
// 语义:
// - 跳过:该节 status='skipped',不参与排期、不出现在今日待学,
//   其后面的任务自动往前顶(重排剩余未完成节)
// - 恢复:改回 'pending' 并重新排入计划(按 ordinal 回到原位置)
//
// 批量操作可能跨多门课,所以按 courseId 分组,各自用自己课程的节奏重排。

import { db } from './index.js'
import { rescheduleActive, toDateStr } from './scheduler.js'

async function rescheduleCourse(courseId, todayStr) {
  const course = await db.courses.get(courseId)
  if (!course) return
  const all = await db.lessons.where('courseId').equals(courseId).toArray()
  if (!all.length) return

  const plan = rescheduleActive({
    lessons: all,
    lessonsPerDay: course.lessonsPerDay || 1,
    weekendBoosted: !!course.weekendBoosted,
    weekdays: course.weekdays || null,
    today: todayStr
  })
  const byOrdinal = {}
  for (const p of plan) byOrdinal[p.ordinal] = p

  const now = new Date().toISOString()
  await db.lessons.where('courseId').equals(courseId).modify(l => {
    // 已跳过的节:清空排期(离开时间线,避免旧日期把顺序插乱)
    if (l.status === 'skipped') {
      if (l.plannedDate != null || l.orderInDay !== 0) {
        l.plannedDate = null
        l.orderInDay = 0
        l.updatedAt = now
      }
      return
    }
    const p = byOrdinal[l.ordinal]
    if (p) {
      l.plannedDate = p.plannedDate
      l.orderInDay = p.orderInDay
      l.updatedAt = now
    }
  })

  // 计划完成日期 = 未完成且未跳过的节里最晚的日期
  const activeDates = all
    .filter(l => l.status !== 'done' && l.status !== 'skipped')
    .map(l => byOrdinal[l.ordinal]?.plannedDate)
    .filter(Boolean)
    .sort()
  await db.courses.update(courseId, {
    plannedEndDate: activeDates.length ? activeDates[activeDates.length - 1] : course.plannedEndDate,
    updatedAt: now
  })
}

async function applyStatus(lessonIds, status, todayStr) {
  const ids = (lessonIds || []).filter(id => id != null)
  if (!ids.length) return { count: 0, courses: 0 }

  const lessons = await db.lessons.where('id').anyOf(ids).toArray()
  if (!lessons.length) return { count: 0, courses: 0 }

  const courseIds = [...new Set(lessons.map(l => l.courseId))]
  const now = new Date().toISOString()

  await db.transaction('rw', [db.lessons, db.courses], async () => {
    await db.lessons.where('id').anyOf(ids).modify(l => {
      l.status = status
      l.updatedAt = now
      if (status === 'skipped') {
        l.skipReason = l.skipReason || 'other'
        // 关键:跳过的节立刻离开排期。若保留旧 plannedDate,
        // 恢复其他节时它会以旧日期插在时间线里,导致顺序倒乱
        l.plannedDate = null
        l.orderInDay = 0
      } else {
        delete l.skipReason
      }
    })
    for (const cid of courseIds) {
      await rescheduleCourse(cid, todayStr)
    }
  })

  return { count: lessons.length, courses: courseIds.length }
}

/** 批量跳过:标记 skipped 并重排(后面的任务往前顶) */
export async function skipLessons(lessonIds, todayStr) {
  return applyStatus(lessonIds, 'skipped', todayStr || toDateStr(new Date()))
}

/** 批量取消跳过:改回 pending 并重新排入计划 */
export async function restoreLessons(lessonIds, todayStr) {
  return applyStatus(lessonIds, 'pending', todayStr || toDateStr(new Date()))
}
