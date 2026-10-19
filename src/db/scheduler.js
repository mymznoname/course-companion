// 任务分配算法(Pure function)
//
// 按 PRD §7 实现:
// - 初始分配:从 startDate 起贪心逐日排,遇周末按 1.5x 加权
// - 改节奏:从今天起,只为未完成节重新分配
//
// 设计要点:
// - 函数全部接受 ISO 字符串或 Date,输出 ISO 字符串(YYYY-MM-DD)
// - 不依赖外部状态,纯函数易测

import { format, addDays, parseISO, isWeekend } from 'date-fns'

/** YYYY-MM-DD 辅助 */
export function toDateStr(d) {
  return format(d, 'yyyy-MM-dd')
}
export function fromDateStr(s) {
  return parseISO(s)
}

/** ISO 日期字符串 + N 天 → YYYY-MM-DD */
export function addDaysISO(dateStr, days) {
  return toDateStr(addDays(fromDateStr(dateStr), days))
}

/**
 * 归一化「每周哪几天学」
 * @param {number[]|null|undefined} weekdays - 0=周日 ... 6=周六(与 Date#getDay 一致)
 * @returns {Set<number>|null} null 表示每天都学(不限)
 */
export function normalizeWeekdays(weekdays) {
  if (!Array.isArray(weekdays)) return null
  const clean = [...new Set(weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
  // 空数组或全选 7 天 = 每天都学
  if (clean.length === 0 || clean.length === 7) return null
  return new Set(clean)
}

/**
 * 给定 today 与每节课的标题数组,产出每天分配哪些 lesson 索引
 * @param {Object} params
 * @param {Array<{ordinal:number,title:string}>} params.lessons - 课程总节
 * @param {number} params.lessonsPerDay - 每天学几节
 * @param {boolean} [params.weekendBoosted] - 周末 1.5x (向上取整)
 * @param {number[]} [params.weekdays] - 只在这些星期几排课(0=周日…6=周六);不传/空 = 每天
 * @param {string} [params.startDate] - 起始日期 YYYY-MM-DD,默认今天
 * @param {string} [params.today] - 今天 YYYY-MM-DD,用于"过去日期挪到今天"处理
 * @returns {Array<{ordinal:number,title:string,plannedDate:string,orderInDay:number}>}
 */
export function scheduleLessons({
  lessons,
  lessonsPerDay,
  weekendBoosted = false,
  weekdays = null,
  startDate,
  today
}) {
  if (!lessons || !lessons.length || !lessonsPerDay) return []

  const todayStr = today || toDateStr(new Date())
  const start = fromDateStr(startDate || todayStr)
  const allowed = normalizeWeekdays(weekdays)

  // 计算每天的容量(节数)
  function capacityFor(date) {
    let cap = lessonsPerDay
    if (weekendBoosted && isWeekend(date)) {
      cap = Math.ceil(lessonsPerDay * 1.5)
    }
    return cap
  }

  const out = []
  let cursor = start
  let remaining = lessons.length
  let dayIndex = 0
  // 同一天内 order 从 1 开始
  let dayOrder = 1

  // 上限:所有课压缩到 N 天内 + 余量,避免无限循环
  // 若限定了星期几,最坏情况是每节都要往后找 7 天,所以乘 7
  const maxDays = allowed ? lessons.length * 7 + 14 : lessons.length + 7
  let safety = 0

  while (remaining > 0 && safety < maxDays) {
    // 这天不在允许的星期几里 → 跳过,不排任何课
    if (allowed && !allowed.has(cursor.getDay())) {
      cursor = addDays(cursor, 1)
      dayOrder = 1
      safety++
      dayIndex++
      continue
    }

    const cap = capacityFor(cursor)
    const assignCount = Math.min(cap, remaining)

    // 找到当前 cursor 是几号
    // 同一天的 lesson 顺序:按 lessons 顺序依次填入
    for (let i = 0; i < assignCount; i++) {
      const idx = out.length
      if (idx >= lessons.length) break
      const lesson = lessons[idx]
      out.push({
        ordinal: lesson.ordinal,
        title: lesson.title,
        plannedDate: toDateStr(cursor),
        orderInDay: dayOrder
      })
      dayOrder++
    }

    remaining -= assignCount
    if (remaining === 0) break

    cursor = addDays(cursor, 1)
    dayOrder = 1
    dayIndex++
    safety++
  }

  // 处理"已过去日期" — 把 startDate..today-1 之间标记为 pending 但日期已过,
  // UI 层提示用户去补;这里只是产生日期,不做挪动。
  // 若用户开启 "重置计划" 才动已完成之外的日期。

  return out
}

/**
 * 改节奏后重新平衡(只动未完成的节)
 * @param {Object} params
 * @param {Array<{ordinal:number,title:string,status:string,plannedDate?:string,orderInDay?:number}>} params.lessons - 现有节
 * @param {number} params.lessonsPerDay - 新每天几节
 * @param {boolean} [params.weekendBoosted]
 * @param {number[]} [params.weekdays] - 只在这些星期几排课;不传 = 每天
 * @param {string} [params.today]
 * @returns {Array<{ordinal:number,title:string,plannedDate:string,orderInDay:number}>}
 *
 * 保持已完成节(doneness.status==='done')的 plannedDate 不变;其余按新节奏从今天起重新分配。
 */
export function rebalanceLessons({
  lessons,
  lessonsPerDay,
  weekendBoosted = false,
  weekdays = null,
  today
}) {
  if (!lessons || !lessons.length) return []

  const todayStr = today || toDateStr(new Date())
  const doneOnes = lessons.filter(l => l.status === 'done').map(l => ({
    ordinal: l.ordinal,
    title: l.title,
    status: l.status
  }))
  const pendingOnes = lessons.filter(l => l.status !== 'done').map(l => ({
    ordinal: l.ordinal,
    title: l.title
  }))

  const scheduledPending = scheduleLessons({
    lessons: pendingOnes,
    lessonsPerDay,
    weekendBoosted,
    weekdays,
    startDate: todayStr,
    today: todayStr
  })

  // 已完成的节保持原 plannedDate,排前面;未完成的跟在后面
  // 这里假定"已完成"与"未完成"按 ordinal 已经分好,直接 concat
  const doneCount = doneOnes.length
  const final = []

  // 先按 ordinal 升序重排所有 done + scheduledPending
  const merged = [
    ...lessons.filter(l => l.status === 'done').map(l => ({
      ordinal: l.ordinal,
      title: l.title,
      plannedDate: l.plannedDate || todayStr,
      orderInDay: l.orderInDay || 1,
      _done: true
    })),
    ...scheduledPending.map(l => ({ ...l, _done: false }))
  ]
  merged.sort((a, b) => a.ordinal - b.ordinal)

  // 重新计算 orderInDay(按 plannedDate 分组)
  const groupCounts = {}
  for (const m of merged) {
    if (!groupCounts[m.plannedDate]) groupCounts[m.plannedDate] = 0
    groupCounts[m.plannedDate]++
    m.orderInDay = groupCounts[m.plannedDate]
  }

  // 去除 _done 标记
  return merged.map(({ ordinal, title, plannedDate, orderInDay }) => ({
    ordinal, title, plannedDate, orderInDay
  }))
}

/**
 * 跳过 / 恢复跳过后的重排
 *
 * 规则:
 * - 已完成的节:保持原 plannedDate 不动
 * - 已跳过的节:**不参与排期,plannedDate 置空**(离开时间线,只在「已跳过」区块展示)
 *   —— 这是关键:跳过的节若保留旧日期,会在时间线里插错位置(顺序倒乱)
 * - 其余(pending/learning):从今天起按节奏重新分配 → 后面的任务自动往前顶
 *
 * @returns {Array<{ordinal:number,plannedDate:string,orderInDay:number}>} 只含已完成 + 未完成节
 */
export function rescheduleActive({ lessons, lessonsPerDay, weekendBoosted = false, weekdays = null, today }) {
  if (!lessons || !lessons.length || !lessonsPerDay) return []

  const todayStr = today || toDateStr(new Date())
  const done = lessons.filter(l => l.status === 'done')
  const active = lessons.filter(l => l.status !== 'done' && l.status !== 'skipped')

  // 起始日:今天;若用户提前完成过未来日期的节,则从最晚完成日之后开始,
  // 保证时间线上 ordinal 始终单调递增
  const latestDone = done.reduce((mx, l) => (l.plannedDate && l.plannedDate > mx ? l.plannedDate : mx), '')
  const startFrom = latestDone && latestDone > todayStr ? latestDone : todayStr

  const scheduled = scheduleLessons({
    lessons: active.map(l => ({ ordinal: l.ordinal, title: l.title })),
    lessonsPerDay,
    weekendBoosted,
    weekdays,
    startDate: startFrom,
    today: todayStr
  })

  const merged = [
    ...done.map(l => ({
      ordinal: l.ordinal,
      plannedDate: l.plannedDate || todayStr,
      orderInDay: l.orderInDay || 1
    })),
    ...scheduled.map(l => ({ ordinal: l.ordinal, plannedDate: l.plannedDate, orderInDay: l.orderInDay }))
  ]
  merged.sort((a, b) => a.ordinal - b.ordinal)

  // 按日期重新编号 orderInDay(保持 ordinal 顺序)
  const groupCounts = {}
  for (const m of merged) {
    groupCounts[m.plannedDate] = (groupCounts[m.plannedDate] || 0) + 1
    m.orderInDay = groupCounts[m.plannedDate]
  }

  return merged.map(({ ordinal, plannedDate, orderInDay }) => ({ ordinal, plannedDate, orderInDay }))
}

/**
 * 给定 today 与课程列表,返回今天该学的 lesson 列表(扁平)
 *
 * 顺延规则:当天没点「已学完」的节**不会消失**,而是顺延到今天 ——
 * 只要还没完成(done)也没跳过(skipped),plannedDate <= today 的节
 * 每天都会出现在今日待学里,直到被学完或被主动跳过。
 *
 * 已学完(done)和已跳过(skipped)都不出现。
 */
export function getTodayLessons(allLessons, todayStr) {
  const today = todayStr || toDateStr(new Date())
  return allLessons
    .filter(l => l.plannedDate && l.plannedDate <= today && l.status !== 'done' && l.status !== 'skipped')
    .sort((a, b) => {
      if (a.courseId !== b.courseId) return a.courseId - b.courseId
      if (a.plannedDate !== b.plannedDate) return a.plannedDate < b.plannedDate ? -1 : 1
      return (a.orderInDay || 0) - (b.orderInDay || 0)
    })
}

/**
 * 判断某节是否逾期
 */
export function isOverdue(plannedDateStr, todayStr) {
  const today = todayStr || toDateStr(new Date())
  return plannedDateStr < today
}
