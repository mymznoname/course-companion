import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cleanLessons, cleanCourseTitle } from '../utils/bilibili.js'

/**
 * 导入横幅:书签栏工具把 B站 目录 POST 进服务器后,
 * 软件打开时顶部提示「收到导入 → 去创建」。
 * 服务器没开时静默(不影响正常使用)。
 */
export default function ImportBanner() {
  const navigate = useNavigate()
  const [item, setItem] = useState(null)

  useEffect(() => {
    let alive = true
    async function check() {
      try {
        const r = await fetch('/api/import')
        if (!r.ok) return
        const data = await r.json()
        if (alive && data.items && data.items.length) setItem(data.items[0])
        else if (alive) setItem(null)
      } catch { /* 服务器没开,静默 */ }
    }
    check()
    const timer = setInterval(check, 20000)
    // 导入被消费(创建课程/忽略)时立刻刷新,不用等轮询
    const onChanged = () => check()
    window.addEventListener('import-changed', onChanged)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('import-changed', onChanged) }
  }, [])

  if (!item) return null

  // 显示清洗后的节数,避免和「去创建」里看到的目录数量对不上
  const cleanedCount = cleanLessons(item.lessons).length
  const showCount = cleanedCount || item.lessons.length
  const showTitle = cleanCourseTitle(item.title) || item.title

  async function dismiss() {
    try { await fetch('/api/import/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) }) } catch { /* ignore */ }
    setItem(null)
    window.dispatchEvent(new Event('import-changed'))
  }

  return (
    <div className="import-banner">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="h3">收到 B站 导入</div>
        <div className="text-sm text-soft" style={{ wordBreak: 'break-word' }}>
          《{showTitle}》共 {showCount} 节
        </div>
      </div>
      <div className="row gap-2">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => navigate(`/library/new?import=${item.id}`)}
        >
          去创建
        </button>
        <button className="btn btn-ghost btn-sm" onClick={dismiss}>忽略</button>
      </div>
    </div>
  )
}
