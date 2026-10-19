import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProfile } from '../store/profile.js'
import { db } from '../db/index.js'
import { toDateStr } from '../db/scheduler.js'
import { computeStreak, weekCompare, thisWeekCounts, courseHealth } from '../utils/stats.js'
import XpBar from '../components/XpBar.jsx'
import { useFeedbackFx } from '../utils/feedback.js'
import { BOOKMARKLET_SRC } from '../utils/bilibili.js'

const TIER_LABEL = {
  off: '关 — 静默打卡,无动效',
  standard: '标准 — 勾选动画 + XP+5 + 轻高亮',
  game: '游戏化 — 撒花动画 + XP+10 + 升级特效'
}

export default function Settings() {
  const level = useProfile((s) => s.level)
  const xp = useProfile((s) => s.xp)
  const feedbackTier = useProfile((s) => s.feedbackTier)
  const setFeedbackTier = useProfile((s) => s.setFeedbackTier)
  const badges = useProfile((s) => s.badges)
  const settings = useProfile((s) => s.settings)
  const updateSettings = useProfile((s) => s.updateSettings)
  const pushToast = useFeedbackFx((s) => s.pushToast)

  const [importing, setImporting] = useState(false)

  // 学习数据卡片(复盘入口)
  const lessonsAll = useLiveQuery(() => db.lessons.toArray(), [], [])
  const coursesAll = useLiveQuery(() => db.courses.toArray(), [], [])
  const todayStr = toDateStr(new Date())

  const studyStats = useMemo(() => {
    if (!lessonsAll) return null
    const activeCount = (coursesAll || []).filter(c => c.status === 'active').length
    const behindCount = (coursesAll || [])
      .filter(c => c.status === 'active')
      .filter(c => courseHealth(c, lessonsAll, todayStr).status === 'behind').length
    return {
      streak: computeStreak(lessonsAll, todayStr),
      week: weekCompare(lessonsAll, todayStr),
      bars: thisWeekCounts(lessonsAll, todayStr),
      activeCount,
      behindCount
    }
  }, [lessonsAll, coursesAll, todayStr])

  async function exportJson() {
    try {
      const courses = await db.courses.toArray()
      const lessons = await db.lessons.toArray()
      const summaries = await db.summaries.toArray()
      const reviews = await db.reviews.toArray()
      const exports = await db.exports.toArray()
      const profile = await db.profile.toArray()
      const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        courses, lessons, summaries, reviews, exports, profile
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `course-app-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      pushToast('已导出备份')
    } catch (e) {
      pushToast('导出失败')
    }
  }

  function pickJson() { document.getElementById('import-file').click() }

  async function importJson(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.version) throw new Error('无效备份')
      const ok = confirm('导入会覆盖现有数据,确定吗?')
      if (!ok) { setImporting(false); return }
      await db.transaction('rw', [db.courses, db.lessons, db.summaries, db.reviews, db.exports, db.profile], async () => {
        await db.courses.clear()
        await db.lessons.clear()
        await db.summaries.clear()
        await db.reviews.clear()
        await db.exports.clear()
        await db.profile.clear()
        if (data.courses?.length) await db.courses.bulkAdd(data.courses)
        if (data.lessons?.length) await db.lessons.bulkAdd(data.lessons)
        if (data.summaries?.length) await db.summaries.bulkAdd(data.summaries)
        // 旧版备份(v1)没有 reviews,导入后按现有课程重新排一遍即可,不至于丢
        if (data.reviews?.length) await db.reviews.bulkAdd(data.reviews)
        if (data.exports?.length) await db.exports.bulkAdd(data.exports)
        if (data.profile?.length) await db.profile.bulkAdd(data.profile)
      })
      pushToast('导入完成,刷新页面...')
      setTimeout(() => location.reload(), 1200)
    } catch (e) {
      pushToast('导入失败:' + e.message)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  async function clearAll() {
    if (!confirm('确定清空所有数据吗?此操作不可恢复!')) return
    if (!confirm('真的要清空吗?最后一次确认')) return
    db.close() // 先关闭连接,否则多标签页时 delete 会被挂起
    await db.delete()
    pushToast('已清空,3 秒后刷新...')
    setTimeout(() => location.reload(), 3000)
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_SRC)
      pushToast('代码已复制。新建书签,把代码粘到地址栏保存即可')
    } catch {
      prompt('手动复制下面的代码,新建书签粘贴到地址栏:', BOOKMARKLET_SRC)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="h1">我</div>
      </div>

      <div className="card">
        <XpBar />
        <div className="row gap-2 mt-3 text-xs text-muted">
          <span>等级 Lv.{level}</span>
          <span>·</span>
          <span>累计 XP {xp}</span>
          <span>·</span>
          <span>徽章 {badges.length}</span>
        </div>
      </div>

      {studyStats && (
        <Link to="/review" className="card mt-3" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="row-between">
            <div className="text-soft text-sm">学习数据</div>
            <span className="text-primary text-xs">详细复盘 →</span>
          </div>
          <div className="row gap-2 mt-2 text-sm">
            <span>本周 <strong>{studyStats.week.thisWeek}</strong> 节</span>
            <span className="text-muted">·</span>
            <span>连续 <strong>{studyStats.streak}</strong> 天</span>
            <span className="text-muted">·</span>
            <span>{studyStats.activeCount} 门在读</span>
            {studyStats.behindCount > 0 && <span className="text-warning">· {studyStats.behindCount} 门落后</span>}
          </div>
          <div className="row gap-2 mt-3" style={{ alignItems: 'flex-end', height: 28 }}>
            {studyStats.bars.map((b, i) => (
              <div key={b.date} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: Math.max(2, (b.count / Math.max(1, ...studyStats.bars.map(x => x.count))) * 20),
                  background: b.count > 0 ? '#1D9E75' : 'var(--c-border-tertiary)',
                  borderRadius: '2px 2px 0 0'
                }} />
                <div className="text-xs text-muted" style={{ fontSize: 9, marginTop: 2 }}>{'一二三四五六日'[i]}</div>
              </div>
            ))}
          </div>
        </Link>
      )}

      <div className="section">
        <div className="section-title">复习设置</div>
        <div className="card col gap-3">
          <label className="row gap-2" style={{ padding: '4px 0' }}>
            <input
              type="checkbox"
              checked={settings.reviewEnabled !== false}
              onChange={(e) => updateSettings({ reviewEnabled: e.target.checked })}
            />
            <span>开启复习提醒</span>
          </label>
          <div className="text-xs text-muted">
            学完一节课后,按下面的间隔提醒你回顾它的总结。到日在「今天」页顶部「今日回顾」出现。
          </div>
          <div>
            <div className="text-sm text-soft mb-2">复习间隔(天)</div>
            <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
              {(settings.reviewIntervals || []).map(n => (
                <span key={n} className="row gap-1" style={{
                  background: 'var(--c-primary-tint)', border: '1px solid var(--c-primary)',
                  borderRadius: 999, padding: '3px 4px 3px 10px', fontSize: 13
                }}>
                  {n} 天
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '0 4px', minWidth: 0, lineHeight: 1 }}
                    onClick={() => updateSettings({ reviewIntervals: (settings.reviewIntervals || []).filter(x => x !== n) })}
                    aria-label={`删除 ${n} 天间隔`}
                  >×</button>
                </span>
              ))}
              {(settings.reviewIntervals || []).length === 0 && <span className="text-xs text-muted">没有间隔,将不会生成复习提醒</span>}
            </div>
            <div className="row gap-2 mt-3">
              <input
                className="input"
                type="number"
                min={1}
                max={365}
                placeholder="天数,如 3"
                id="review-interval-input"
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('add-interval-btn')?.click() }}
              />
              <button
                id="add-interval-btn"
                className="btn btn-secondary"
                onClick={() => {
                  const input = document.getElementById('review-interval-input')
                  const n = Number(input.value)
                  if (!n || n < 1 || n > 365) { pushToast('填 1-365 之间的天数'); return }
                  const cur = settings.reviewIntervals || []
                  if (cur.includes(n)) { pushToast('这个间隔已经有了'); return }
                  updateSettings({ reviewIntervals: [...cur, n].sort((a, b) => a - b) })
                  input.value = ''
                }}
              >添加</button>
              <button
                className="btn btn-ghost"
                onClick={() => updateSettings({ reviewIntervals: [1, 3, 7, 14, 30] })}
              >恢复默认</button>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">每日提醒</div>
        <div className="card col gap-3">
          <label className="row gap-2" style={{ padding: '4px 0' }}>
            <input
              type="checkbox"
              checked={settings.reminderEnabled === true}
              onChange={(e) => updateSettings({ reminderEnabled: e.target.checked })}
            />
            <span>开启每日提醒</span>
          </label>
          <div className="text-xs text-muted">
            到设定时间还没记录完,会弹 Windows 通知(软件关着也能收到——开机自启的服务器在跑)。
            文案是「今天还有 N 节课没记录」,不会吵你,一天只弹一次。
          </div>
          <div className="row gap-2" style={{ alignItems: 'center' }}>
            <span className="text-sm text-soft">提醒时间</span>
            <input
              className="input"
              type="time"
              value={settings.reminderTime || '22:00'}
              onChange={(e) => updateSettings({ reminderTime: e.target.value || '22:00' })}
              style={{ width: 110 }}
            />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">反馈档位</div>
        <div className="card col gap-2">
          {Object.entries(TIER_LABEL).map(([k, label]) => (
            <label key={k} className="row gap-2" style={{ padding: '4px 0' }}>
              <input
                type="radio"
                name="tier"
                checked={feedbackTier === k}
                onChange={() => setFeedbackTier(k)}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">徽章</div>
        <div className="card row gap-2" style={{ flexWrap: 'wrap' }}>
          {badges.length === 0 && <div className="text-sm text-muted">还没有徽章,完成第一节课程解锁</div>}
          {badges.map(b => (
            <div key={b} className="chip chip-primary">{b}</div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">B站目录工具</div>
        <div className="card col gap-3">
          <div className="text-sm text-soft">
            抓 B站 课程/合集目录,装一次,以后每门课点一下就行:
          </div>
          <div className="text-sm" style={{ lineHeight: 1.8 }}>
            <div><b>1.</b> 把下面这个按钮<b>拖到浏览器书签栏</b>(Ctrl+Shift+B 可显示书签栏)</div>
            <div><b>2.</b> 在 B站 打开课程的合集/系列页面</div>
            <div><b>3.</b> 点一下书签栏里的它 → 弹窗提示「已发送 N 节」</div>
            <div><b>4.</b> 回到软件,顶部会出现导入提示 → 点「去创建」,标题和目录已自动填好</div>
          </div>
          <div className="text-xs text-muted">
            前提:本地服务在跑(任务栏有最小化的「网课伴学·本地服务」窗口)。服务没开时会自动降级为复制到剪贴板,手动粘贴即可。
          </div>
          <a
            className="btn btn-primary"
            href={BOOKMARKLET_SRC}
            style={{ textAlign: 'center' }}
            draggable
          >
            📚 抓取 B站目录
          </a>
          <button
            className="btn btn-secondary btn-sm"
            onClick={copyBookmarklet}
          >
            拖不动?点我复制代码,手动建书签
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">数据</div>
        <div className="col gap-2">
          <button className="btn btn-secondary" onClick={exportJson}>导出 JSON 备份</button>
          <button className="btn btn-secondary" onClick={pickJson} disabled={importing}>
            {importing ? '导入中...' : '导入 JSON 备份'}
          </button>
          <input
            id="import-file"
            type="file"
            accept="application/json"
            onChange={importJson}
            style={{ display: 'none' }}
          />
          <button className="btn btn-danger" onClick={clearAll}>清空所有数据</button>
        </div>
      </div>

      <div className="section text-center text-xs text-muted">
        网课伴学 v0.1 · 数据全部存于本地,不上传
      </div>
    </div>
  )
}
