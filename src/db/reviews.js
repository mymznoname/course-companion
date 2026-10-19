// 复习提醒(艾宾浩斯式间隔回顾)
// 学完一节课时,按用户设定的间隔(默认 1/3/7/14/30 天)生成复习点;
// 到日(或错过)后在「今天」页顶部「今日回顾」区块出现,看总结 → 标记已回顾。
import { db } from './index.js'
import { toDateStr, addDaysISO } from './scheduler.js'

export const DEFAULT_INTERVALS = [1, 3, 7, 14, 30]

/** 某节课打卡后,按间隔批量生成复习点 */
export async function scheduleReviews(lessonId, intervals, todayStr) {
  const list = (Array.isArray(intervals) ? intervals : DEFAULT_INTERVALS)
    .map(n => Number(n))
    .filter(n => Number.isFinite(n) && n > 0 && n <= 365)
  if (!list.length) return 0
  const today = todayStr || toDateStr(new Date())
  // 避免重复生成(同一节课已有复习点就跳过)
  const existing = await db.reviews.where('lessonId').equals(lessonId).count()
  if (existing > 0) return 0

  const now = new Date().toISOString()
  const rows = list.map(n => ({
    lessonId,
    dueDate: addDaysISO(today, n),
    doneAt: null,
    createdAt: now
  }))
  await db.reviews.bulkAdd(rows)
  return rows.length
}

/** 今天该回顾的(含之前错过的,顺延不消失) */
export async function getDueReviews(todayStr) {
  const today = todayStr || toDateStr(new Date())
  const all = await db.reviews.where('dueDate').belowOrEqual(today).toArray()
  return all.filter(r => !r.doneAt)
}

/** 标记已回顾 */
export async function markReviewed(reviewId) {
  await db.reviews.update(reviewId, { doneAt: new Date().toISOString() })
}

/** 标记某节课所有未回顾的复习点为已回顾(同一节课的多个到期点一次清掉) */
export async function markLessonReviewed(lessonId) {
  const undone = await db.reviews.where('lessonId').equals(lessonId).filter(r => !r.doneAt).toArray()
  const now = new Date().toISOString()
  await db.reviews.where('lessonId').equals(lessonId).filter(r => !r.doneAt).modify({ doneAt: now })
  return undone.length
}

/** 取消「已回顾」(反悔) */
export async function unmarkReviewed(reviewId) {
  await db.reviews.update(reviewId, { doneAt: null })
}

/** 删课时级联清理这些节的复习点 */
export async function deleteReviewsForLessons(lessonIds) {
  if (!lessonIds || !lessonIds.length) return
  await db.reviews.where('lessonId').anyOf(lessonIds).delete()
}

/** 某节课的复习进度(已回顾数 / 总数) */
export async function reviewProgress(lessonId) {
  const all = await db.reviews.where('lessonId').equals(lessonId).toArray()
  return { done: all.filter(r => r.doneAt).length, total: all.length }
}
