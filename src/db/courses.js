// 课程 CRUD 辅助函数
import { db } from './index.js'
import { deleteReviewsForLessons } from './reviews.js'

/**
 * 把课的状态同步为 done(若全部节完成),否则 active
 */
export async function syncCourseStatus(courseId, forceStatus) {
  const course = await db.courses.get(courseId)
  if (!course) return
  if (forceStatus) {
    const now = new Date().toISOString()
    await db.courses.update(courseId, {
      status: forceStatus,
      finishedAt: forceStatus === 'done' ? now : course.finishedAt,
      updatedAt: now
    })
    return
  }

  const remaining = await db.lessons
    .where('courseId').equals(courseId)
    .filter(l => l.status !== 'done')
    .count()
  const now = new Date().toISOString()
  if (remaining === 0 && course.status !== 'done') {
    await db.courses.update(courseId, {
      status: 'done',
      finishedAt: now,
      updatedAt: now
    })
  }
}

/**
 * 添加课程 + 节批量插入
 */
export async function addCourseWithLessons(course, lessons) {
  const now = new Date().toISOString()
  const courseId = await db.courses.add({
    ...course,
    status: 'active',
    createdAt: now,
    updatedAt: now
  })
  // 批量插入 lessons(每条加 courseId 和默认 status=pending)
  const data = lessons.map((l, i) => ({
    courseId,
    ordinal: l.ordinal,
    title: l.title,
    estimatedMinutes: 10,
    plannedDate: l.plannedDate,
    orderInDay: l.orderInDay || 1,
    status: 'pending',
    createdAt: now,
    updatedAt: now
  }))
  await db.lessons.bulkAdd(data)
  return courseId
}

/**
 * 删除课程(连同它的节、总结、导出记录一起删,不可恢复)
 */
export async function deleteCourse(courseId) {
  await db.transaction('rw', [db.courses, db.lessons, db.summaries, db.exports, db.reviews], async () => {
    const lessons = await db.lessons.where('courseId').equals(courseId).toArray()
    const lessonIds = lessons.map(l => l.id)
    if (lessonIds.length) {
      await db.summaries.where('lessonId').anyOf(lessonIds).delete()
    }
    await db.lessons.where('courseId').equals(courseId).delete()
    await db.exports.where('courseId').equals(courseId).delete()
    await db.reviews.where('lessonId').anyOf(lessonIds.length ? lessonIds : [-1]).delete()
    await db.courses.delete(courseId)
  })
}

/**
 * 修改节奏并重排未完成节(调用 scheduler.rebalanceLessons)
 */
export async function changePaceAndReschedule(courseId, newLessonsPerDay, weekendBoosted, rebalanceFn) {
  const course = await db.courses.get(courseId)
  if (!course) return
  const lessons = await db.lessons.where('courseId').equals(courseId).toArray()
  lessons.sort((a, b) => a.ordinal - b.ordinal)
  const today = new Date().toISOString().slice(0, 10)
  const rescheduled = rebalanceFn({
    lessons,
    lessonsPerDay: newLessonsPerDay,
    weekendBoosted,
    today
  })
  // 已完成的节保留原 plannedDate(orderInDay 不动)
  const done = lessons.filter(l => l.status === 'done')
  const pendingRescheduled = rescheduled.filter(r => !done.find(d => d.ordinal === r.ordinal))
  const now = new Date().toISOString()
  // 先清空所有 pending 的 plannedDate/orderInDay
  await db.lessons
    .where('courseId').equals(courseId)
    .filter(l => l.status !== 'done')
    .modify({ plannedDate: null, orderInDay: 0, updatedAt: now })
  // 写回
  for (const r of pendingRescheduled) {
    const target = await db.lessons
      .where('courseId').equals(courseId)
      .filter(l => l.ordinal === r.ordinal)
      .first()
    if (target) {
      await db.lessons.update(target.id, {
        plannedDate: r.plannedDate,
        orderInDay: r.orderInDay,
        updatedAt: now
      })
    }
  }
  // 更新课程的 plannedEndDate
  if (pendingRescheduled.length > 0) {
    const dates = pendingRescheduled.map(r => r.plannedDate).sort()
    await db.courses.update(courseId, {
      lessonsPerDay: newLessonsPerDay,
      weekendBoosted,
      plannedEndDate: dates[dates.length - 1],
      updatedAt: now
    })
  }
}
