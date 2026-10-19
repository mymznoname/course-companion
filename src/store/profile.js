// 用户档案 — Zustand 持久化到 localStorage
import { create } from 'zustand'
import { db, ensureProfile } from '../db/index.js'

export const useProfile = create((set, get) => ({
  loaded: false,
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

  async load() {
    try {
      const profile = await ensureProfile()
      if (profile) {
        set({
          loaded: true,
          level: profile.level,
          xp: profile.xp,
          feedbackTier: profile.feedbackTier,
          badges: profile.badges || [],
          settings: { ...get().settings, ...(profile.settings || {}) }
        })
        return
      }
      // profile 不存在也视为加载完成(默认值)
      set({ loaded: true })
    } catch (e) {
      console.error('[profile.load] failed:', e)
      // 失败也要放行 UI,别把用户卡在加载页
      set({ loaded: true })
    }
  },

  /** 通用设置更新(合并写库) */
  async updateSettings(patch) {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    await db.profile.update('me', { settings: next, updatedAt: new Date().toISOString() })
  },

  /** 增加 XP 并按需升级 */
  async addXp(delta) {
    const { xp, level } = get()
    let newXp = xp + delta
    let newLevel = level
    let leveledUp = false
    // 升级公式:升级到 level N 所需累计 XP = sum_{i=1}^{N-1} (100 + (i-1)*50)
    // N=1 → 0;N=2 → 100;N=3 → 250;N=4 → 450;...
    while (newXp >= xpNeededFor(newLevel + 1)) {
      newLevel++
      leveledUp = true
    }
    set({ xp: newXp, level: newLevel })
    await db.profile.update('me', {
      xp: newXp,
      level: newLevel,
      updatedAt: new Date().toISOString()
    })
    return { leveledUp, level: newLevel }
  },

  /** 设置反馈档位 */
  async setFeedbackTier(tier) {
    set({ feedbackTier: tier })
    await db.profile.update('me', {
      feedbackTier: tier,
      updatedAt: new Date().toISOString()
    })
  },

  /** 解锁徽章 */
  async unlockBadge(badgeId) {
    const { badges } = get()
    if (badges.includes(badgeId)) return false
    const next = [...badges, badgeId]
    set({ badges: next })
    await db.profile.update('me', {
      badges: next,
      updatedAt: new Date().toISOString()
    })
    return true
  }
}))

/** 升级到 level N 所需累计 XP(level 1 → 0 XP,level 2 → 100 XP,...) */
export function xpNeededFor(level) {
  if (level <= 1) return 0
  // 100 + 150 + 200 + ... = 100*N + 50*(0+1+...+(N-2))
  // 简化:累计 = sum_{i=1..N-1} (100 + (i-1)*50)
  let total = 0
  for (let i = 1; i < level; i++) {
    total += 100 + (i - 1) * 50
  }
  return total
}

/** 当前等级的总 XP 区间 */
export function xpForLevel(level) {
  return { current: xpNeededFor(level), next: xpNeededFor(level + 1) }
}
