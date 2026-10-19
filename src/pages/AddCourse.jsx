import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { parseDirectory } from '../db/directoryParser.js'
import { scheduleLessons, toDateStr } from '../db/scheduler.js'
import { addCourseWithLessons } from '../db/courses.js'
import { isBilibiliUrl, fetchBilibiliDirectory, cleanLessons, cleanCourseTitle } from '../utils/bilibili.js'
import EmptyState from '../components/EmptyState.jsx'
import Chip from '../components/Chip.jsx'
import WeekdayPicker from '../components/WeekdayPicker.jsx'
import { useFeedbackFx } from '../utils/feedback.js'

const SAMPLE = `第 1 章 入门
  1.1 安装与配置
  1.2 第一个示例
第 2 章 基础
  2.1 变量与函数
  2.2 控制流
第 3 章 进阶
  3.1 异步
  3.2 错误处理
  3.3 模块化`

export default function AddCourse() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pushToast = useFeedbackFx((s) => s.pushToast)

  const [step, setStep] = useState(1)
  const [importId, setImportId] = useState(null) // 来自书签栏一键导入的收件箱条目

  // Step 1
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [note, setNote] = useState('')

  // Step 2
  const [directoryText, setDirectoryText] = useState('')
  const [parsed, setParsed] = useState({ lessons: [], errors: [] })
  const [manualMode, setManualMode] = useState(false)
  const [manualLines, setManualLines] = useState('')

  // Step 3
  const [lessonsPerDay, setLessonsPerDay] = useState(2)
  const [weekendBoosted, setWeekendBoosted] = useState(false)
  // 每周哪几天学(0=周日…6=周六);全选 = 每天都学
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6])
  const [startDate, setStartDate] = useState(toDateStr(new Date()))

  // B站 自动抓取
  const [fetching, setFetching] = useState(false)
  const isBili = isBilibiliUrl(source)

  // ===== 一键导入预填(?import=id)=====
  useEffect(() => {
    const id = Number(searchParams.get('import'))
    if (!id) return
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/import')
        if (!r.ok) return
        const data = await r.json()
        const item = (data.items || []).find(x => x.id === id)
        if (!item || !alive) return
        let cleaned = cleanLessons(item.lessons)
        // 兜底:清洗后为空(比如来源只给了空标题)时,退回原始条目,
        // 避免用户看到「共 N 节」点进来却是空目录
        if (!cleaned.length) {
          cleaned = (item.lessons || [])
            .map((l, i) => ({
              ordinal: i + 1,
              title: String((l && l.title) || (typeof l === 'string' ? l : '') || '').trim()
            }))
            .filter(l => l.title)
        }
        const text = cleaned.map(l => l.ordinal + '. ' + l.title).join('\n')
        setTitle(cleanCourseTitle(item.title || ''))
        setSource(item.url || '')
        setDirectoryText(text)
        setParsed(parseDirectory(text))
        setImportId(item.id)
        setStep(2)
        pushToast(`已导入 ${cleaned.length} 节,检查一下目录`)
      } catch { /* 服务器没开,忽略 */ }
    })()
    return () => { alive = false }
  }, [searchParams, pushToast])

  async function autoFetch() {
    if (fetching) return
    setFetching(true)
    try {
      const r = await fetchBilibiliDirectory(source)
      if (r.ok && r.lessons.length) {
        const cleaned = cleanLessons(r.lessons)
        const text = cleaned.map(l => l.ordinal + '. ' + l.title).join('\n')
        setDirectoryText(text)
        setParsed(parseDirectory(text))
        setStep(2)
        pushToast(`已抓到 ${cleaned.length} 节,检查一下`)
      } else {
        pushToast(r.error + ' — 可改用「我」页的书签栏工具抓取')
      }
    } catch (e) {
      pushToast('抓取出错,可改用「我」页的书签栏工具')
    } finally {
      setFetching(false)
    }
  }

  const finalLessons = useMemo(() => {
    if (manualMode) {
      const lines = (manualLines || '').split('\n').map(l => l.trim()).filter(Boolean)
      return lines.map((t, i) => ({ ordinal: i + 1, title: t }))
    }
    return parsed.lessons
  }, [manualMode, manualLines, parsed])

  const schedulePreview = useMemo(() => {
    if (!finalLessons.length || !lessonsPerDay) return []
    return scheduleLessons({
      lessons: finalLessons,
      lessonsPerDay: Number(lessonsPerDay),
      weekendBoosted,
      weekdays,
      startDate
    })
  }, [finalLessons, lessonsPerDay, weekendBoosted, weekdays, startDate])

  function parseNow() {
    const r = parseDirectory(directoryText)
    setParsed(r)
    if (r.errors.length) {
      pushToast(`解析出 ${r.lessons.length} 节,${r.errors.length} 行未能识别`)
    } else if (r.lessons.length) {
      pushToast(`识别出 ${r.lessons.length} 节`)
    }
  }

  function next() {
    if (step === 1) {
      if (!title.trim()) { pushToast('先填课程标题'); return }
      setStep(2)
    } else if (step === 2) {
      if (!finalLessons.length) {
        pushToast('还没有节,先解析或手动录入')
        return
      }
      if (parsed.errors.length > 0 && !manualMode) {
        const ok = confirm(`有 ${parsed.errors.length} 行未能识别,要继续吗?\n(点 "确定" 直接忽略可疑行,点 "取消" 返回修正)`)
        if (!ok) return
      }
      setStep(3)
    } else if (step === 3) {
      if (!lessonsPerDay || lessonsPerDay < 1) { pushToast('每天几节至少 1 节'); return }
      if (!weekdays.length) { pushToast('至少选一个星期几,不然排不出计划'); return }
      setStep(4)
    }
  }

  async function confirmSave() {
    if (!finalLessons.length || !lessonsPerDay) return
    if (!weekdays.length) { pushToast('至少选一个星期几'); return }
    const totalLessons = finalLessons.length
    const plannedEndDate = schedulePreview.length
      ? schedulePreview[schedulePreview.length - 1].plannedDate
      : null

    const now = new Date().toISOString()
    const courseId = await addCourseWithLessons(
      {
        title: title.trim(),
        source: source.trim() || null,
        note: note.trim() || null,
        totalLessons,
        lessonsPerDay: Number(lessonsPerDay),
        weekendBoosted,
        weekdays,
        startDate,
        plannedEndDate
      },
      schedulePreview
    )
    pushToast('已加入课库,开始学习吧!')
    // 清掉收件箱里这条导入(已消费)
    if (importId) {
      try {
        await fetch('/api/import/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: importId }) })
      } catch { /* ignore */ }
      window.dispatchEvent(new Event('import-changed'))
    }
    navigate(`/course/${courseId}`)
  }

  function stepIndicator() {
    return (
      <div className="row gap-2" style={{ justifyContent: 'center', marginBottom: 16 }}>
        {[1, 2, 3, 4].map(n => (
          <div
            key={n}
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: n === step ? 'var(--c-primary)' : (n < step ? 'var(--c-primary)' : 'var(--c-border-strong)'),
              opacity: n < step ? 0.5 : 1
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => step === 1 ? navigate('/library') : setStep(step - 1)}>
          ← 上一步
        </button>
        <div className="h2">添加课程</div>
        <span style={{ width: 60 }} />
      </div>

      {stepIndicator()}

      {step === 1 && (
        <>
          <div className="card col gap-3">
            <div>
              <label className="field-label">课程标题 *</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如:深入理解 JavaScript"
              />
            </div>
            <div>
              <label className="field-label">网课平台/链接(选填)</label>
              <input
                className="input"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://... 或 慕课网 / B站"
              />
              {isBili && (
                <button
                  className="btn btn-secondary btn-sm mt-2"
                  onClick={autoFetch}
                  disabled={fetching}
                  style={{ width: '100%' }}
                >
                  {fetching ? '正在抓取…' : '⚡ 自动抓取 B站 目录'}
                </button>
              )}
              {isBili && !fetching && (
                <div className="text-xs text-muted mt-2">
                  粘链接 → 点抓取 → 目录自动填好。失败时可用「我」页里的书签栏工具
                </div>
              )}
            </div>
            <div>
              <label className="field-label">备注(选填)</label>
              <textarea
                className="textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="为什么学这门课?目标是什么?"
                rows={3}
              />
            </div>
          </div>

          <div className="row gap-2 mt-4">
            <button className="btn btn-secondary" onClick={() => navigate('/library')} style={{ flex: 1 }}>取消</button>
            <button className="btn btn-primary" onClick={next} style={{ flex: 1 }}>下一步</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="row gap-2 mb-3">
            <button
              className={`btn btn-sm ${manualMode ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => setManualMode(false)}
            >
              粘贴自动解析
            </button>
            <button
              className={`btn btn-sm ${manualMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setManualMode(true)}
            >
              手动逐行录
            </button>
          </div>

          {!manualMode && (
            <>
              <div className="text-sm text-soft mb-2">
                从网课平台复制目录,然后粘贴到下面:
              </div>
              <textarea
                className="textarea"
                rows={10}
                value={directoryText}
                onChange={(e) => setDirectoryText(e.target.value)}
                placeholder={SAMPLE}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
              />
              <button className="btn btn-primary mt-3" onClick={parseNow} style={{ width: '100%' }}>
                解析目录
              </button>

              {parsed.lessons.length > 0 && (
                <div className="card mt-3">
                  <div className="row-between">
                    <div className="h3">识别到 {parsed.lessons.length} 节</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setParsed({ lessons: [], errors: [] })}>
                      清空
                    </button>
                  </div>
                  <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
                    {parsed.lessons.slice(0, 50).map(l => (
                      <div key={l.ordinal} className="note-line text-sm">{l.ordinal}. {l.title}</div>
                    ))}
                    {parsed.lessons.length > 50 && (
                      <div className="text-xs text-muted">…还有 {parsed.lessons.length - 50} 节</div>
                    )}
                  </div>
                  {parsed.errors.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-warning">⚠ {parsed.errors.length} 行未能识别,已忽略:</div>
                      {parsed.errors.slice(0, 5).map((e, i) => (
                        <div key={i} className="text-xs text-muted">第 {e.line} 行: {e.content.slice(0, 30)}…</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {manualMode && (
            <>
              <div className="text-sm text-soft mb-2">
                一行一节标题:
              </div>
              <textarea
                className="textarea"
                rows={12}
                value={manualLines}
                onChange={(e) => setManualLines(e.target.value)}
                placeholder={'第 1 节 开篇\n第 2 节 入门的艺术\n第 3 节 实操'}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
              />
              {manualLines.trim() && (
                <div className="text-xs text-muted mt-2">
                  共 {(manualLines.split('\n').filter(l => l.trim()).length)} 节
                </div>
              )}
            </>
          )}

          <div className="row gap-2 mt-4">
            <button className="btn btn-secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>上一步</button>
            <button
              className="btn btn-primary"
              onClick={next}
              style={{ flex: 1 }}
              disabled={!finalLessons.length}
            >
              下一步 ({finalLessons.length} 节)
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="card col gap-3">
            <div>
              <label className="field-label">总节数:{finalLessons.length}</label>
              <div className="text-sm text-soft">已自动从目录中识别</div>
            </div>
            <div>
              <label className="field-label">每天学几节 *</label>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={lessonsPerDay}
                onChange={(e) => setLessonsPerDay(Number(e.target.value) || 1)}
              />
              <div className="text-xs text-muted mt-2">
                每个学习日学 {lessonsPerDay} 节
              </div>
            </div>
            <div>
              <label className="field-label">每周哪几天学 *</label>
              <WeekdayPicker value={weekdays} onChange={setWeekdays} />
            </div>
            <div>
              <label className="field-label">开始日期</label>
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <label className="row gap-2" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={weekendBoosted}
                onChange={(e) => setWeekendBoosted(e.target.checked)}
              />
              <span className="text-sm">周末多学 1.5 倍</span>
            </label>
          </div>

          <div className="row gap-2 mt-4">
            <button className="btn btn-secondary" onClick={() => setStep(2)} style={{ flex: 1 }}>上一步</button>
            <button className="btn btn-primary" onClick={next} style={{ flex: 1 }}>下一步预览</button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div className="card">
            <div className="h3">预览今日任务</div>
            <div className="text-sm text-soft mt-2">
              {schedulePreview.filter(l => l.plannedDate === startDate).length > 0
                ? `今天要学:${schedulePreview.filter(l => l.plannedDate === startDate).map(l => l.title).join(' / ')}`
                : '今天没有分配任务'}
            </div>
            <div className="mt-3 text-sm text-soft">
              预计 {schedulePreview[schedulePreview.length - 1]?.plannedDate || startDate} 全部学完
            </div>
            <div className="mt-3 row gap-2">
              <Chip kind="primary">{finalLessons.length} 节</Chip>
              <Chip>{lessonsPerDay} 节/天</Chip>
              {weekendBoosted && <Chip kind="warning">周末 ×1.5</Chip>}
            </div>
          </div>

          <div className="card mt-3">
            <div className="h3">前 10 节时间线</div>
            <div className="mt-2">
              {schedulePreview.slice(0, 10).map(l => (
                <div key={l.ordinal} className="note-line text-sm">
                  <span className="text-muted">{l.plannedDate}</span>
                  {' · '}
                  {l.ordinal}. {l.title}
                </div>
              ))}
              {schedulePreview.length > 10 && (
                <div className="text-xs text-muted">…还有 {schedulePreview.length - 10} 节</div>
              )}
            </div>
          </div>

          <div className="row gap-2 mt-4">
            <button className="btn btn-secondary" onClick={() => setStep(3)} style={{ flex: 1 }}>上一步</button>
            <button className="btn btn-primary" onClick={confirmSave} style={{ flex: 1 }}>开始学习</button>
          </div>
        </>
      )}
    </div>
  )
}
