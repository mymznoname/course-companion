// 反馈系统 — 按档位触发
import { create } from 'zustand'

// 一次性反馈事件(Toast / Confetti)
export const useFeedbackFx = create((set) => ({
  toasts: [],
  confetti: 0,
  pushToast(text) {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, text }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, 2200)
  },
  triggerConfetti() {
    const n = Math.floor(Math.random() * 16) + 18
    set((s) => ({ confetti: s.confetti + n }))
    setTimeout(() => set((s) => ({ confetti: Math.max(0, s.confetti - n) })), 1200)
  }
}))

/**
 * 完成一节时的反馈
 * @param {string} tier - off | standard | game
 * @param {string} [message] - 自定义提示文案
 */
export function fireLessonDoneFx(tier, pushToast, triggerConfetti, message) {
  if (tier === 'off') return
  pushToast(message || '已学完 → 一节入账')
  if (tier === 'game') triggerConfetti()
}

/**
 * 完成一门课时的反馈
 */
export function fireCourseDoneFx(tier, courseTitle, pushToast, triggerConfetti) {
  if (tier === 'off') {
    pushToast('课程已完结')
    return
  }
  pushToast(`「${courseTitle}」完结 ✨`)
  if (tier === 'game') triggerConfetti()
}

/**
 * 升级时的反馈
 */
export function fireLevelUpFx(level, tier, pushToast, triggerConfetti) {
  if (tier === 'off') return
  pushToast(`升级到 Lv.${level}`)
  if (tier === 'game') triggerConfetti()
}

/**
 * 解锁徽章时的反馈
 */
export function fireBadgeFx(badgeName, tier, pushToast) {
  if (tier === 'off') return
  pushToast(`徽章解锁:${badgeName}`)
}
