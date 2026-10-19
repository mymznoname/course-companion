// 数据库 — Dexie 封装,IndexedDB
import Dexie from 'dexie'

export const db = new Dexie('courseAppDB')

// 升级函数按版本顺序写;新增表时 +1 并保留旧数据
db.version(1).stores({
  // 课程
  courses: '++id, status, plannedEndDate, createdAt',
  // 节
  lessons: '++id, courseId, plannedDate, status, [courseId+plannedDate], [courseId+status]',
  // 总结(一对一 lessons)
  summaries: '++id, &lessonId, updatedAt',
  // 导出记录(可空表,MVP 仅记录用户何时导出过)
  exports: '++id, courseId, createdAt',
  // 单条 profile
  profile: '&key'
})

// v2:复习提醒表(学完某节 N 天后提醒回顾它的总结)
db.version(2).stores({
  reviews: '++id, lessonId, dueDate, [lessonId+dueDate]'
})

// 多标签页场景:别的标签页删库/升级时,本页会让对方一直阻塞。
// 收到 versionchange 就主动关闭连接并刷新,让大家都能恢复正常状态。
db.on('versionchange', () => {
  db.close()
  setTimeout(() => {
    try { location.reload() } catch { /* ignore */ }
  }, 300)
})

// 初始化 profile(无则创建)
export async function ensureProfile() {
  const existing = await db.profile.get('me')
  if (!existing) {
    await db.profile.put({
      key: 'me',
      level: 1,
      xp: 0,
      feedbackTier: 'standard', // off | standard | game
      badges: [],
      settings: {
        pomodoroMinutes: 25,
        reviewEnabled: true,
        reviewIntervals: [1, 3, 7, 14, 30],
        reminderEnabled: false,
        reminderTime: '22:00'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  }
  return db.profile.get('me')
}
