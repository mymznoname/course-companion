import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { db } from '../db/index.js'
import Chip from './Chip.jsx'

/**
 * 总结编辑器
 * - 受控:父组件控制 open + lesson
 * - 关闭即不保存(用户须显式点保存)
 * - 自动保存草稿(localStorage key=`summaryDraft_${lessonId}`),1.5s 防抖
 * - isEdit=true 时是「修改已有总结」:按钮变「保存修改」,不会再触发打卡/XP(由父组件判断)
 *
 * Props:
 *   open: bool
 *   onClose(): 通常关闭
 *   onSaved(): 关闭并告知父级已保存(可触发反馈)
 *   lesson: { id, ordinal, title, courseTitle }
 *   savedContent: 已保存的总结(若有)
 *   isEdit: bool,是否在改一份已存在的总结
 *   autoSave: bool,默认 true
 */
export default function SummaryEditor({
  open, onClose, onSaved, lesson, savedContent = '', isEdit = false, autoSave = true
}) {
  const [content, setContent] = useState(savedContent || '')
  const [showHelp, setShowHelp] = useState(false)
  const timerRef = useRef(null)
  const draftKey = lesson ? `summaryDraft_${lesson.id}` : ''

  useEffect(() => {
    setContent(savedContent || '')
  }, [savedContent, lesson?.id, open])

  function onChange(e) {
    const v = e.target.value
    setContent(v)
    if (!autoSave || !draftKey) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try { localStorage.setItem(draftKey, v) } catch {}
    }, 1500)
  }

  const wordCount = useMemo(() => content.trim().length, [content])
  const overLimit = wordCount > 3000

  async function save() {
    const text = content.trim()
    if (!text) return
    if (overLimit) return
    const existing = await db.summaries.where('lessonId').equals(lesson.id).first()
    const now = new Date().toISOString()
    if (existing) {
      await db.summaries.update(existing.id, {
        content: text, wordCount: text.length, updatedAt: now
      })
    } else {
      await db.summaries.add({
        lessonId: lesson.id,
        content: text,
        wordCount: text.length,
        createdAt: now,
        updatedAt: now
      })
    }
    try { localStorage.removeItem(draftKey) } catch {}
    onSaved?.()
  }

  // 草稿恢复:从 localStorage 读
  useEffect(() => {
    if (!open || !draftKey) return
    try {
      const draft = localStorage.getItem(draftKey)
      if (draft && !content) setContent(draft)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Modal open={open} onClose={onClose}>
      {lesson && (
        <>
          <div className="text-muted text-xs">
            {lesson.courseTitle ? `${lesson.courseTitle} · ` : ''}第 {lesson.ordinal} 节
            {isEdit && <span className="text-primary"> · 修改总结</span>}
          </div>
          <div className="h2">{lesson.title}</div>
          <div className="row-between mt-3">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowHelp(s => !s)}
            >
              {showHelp ? '收起提示' : '✍ 不知道怎么写?展开模板'}
            </button>
            <span className={`text-xs ${overLimit ? 'text-danger' : 'text-muted'}`}>
              {wordCount} / 3000
            </span>
          </div>
          {showHelp && (
            <div className="card mt-2" style={{ background: 'var(--c-primary-tint)', borderColor: 'transparent' }}>
              <div className="text-sm text-soft">
                用你自己的话回答(没有标准答案):
              </div>
              <ul className="text-sm text-soft mt-2" style={{ paddingLeft: 18, margin: 0 }}>
                <li>这一节<b>讲了什么</b>?用自己的话复述</li>
                <li>你学到了什么?<b>关键概念 / 操作 / 误区</b></li>
                <li>有什么<b>还没弄懂</b>的?</li>
              </ul>
              <div className="text-xs text-muted mt-2">支持 Markdown 语法</div>
            </div>
          )}

          <textarea
            className="textarea mt-3"
            value={content}
            onChange={onChange}
            placeholder="用你自己的话,写下这一节讲了什么..."
            rows={10}
            autoFocus
            maxLength={3500}
          />

          <div className="row gap-2 mt-4">
            <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              取消
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={save}
              disabled={!content.trim() || overLimit}
            >
              {isEdit ? '保存修改' : '保存并打卡'}
            </button>
          </div>

          {content.trim() && (
            <div className="text-xs text-muted mt-2 text-center">
              {isEdit ? '只更新总结内容,不影响打卡记录' : '自动每 1.5 秒保存草稿,关闭会丢失'}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
