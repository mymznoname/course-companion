import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { zhCN } from 'date-fns/locale'
import { format, parseISO } from 'date-fns'
import { db } from '../db/index.js'
import { toDateStr } from '../db/scheduler.js'
import {
  computeStreak, heatmapData, thisWeekCounts, weekCompare,
  courseHealth, weekSentence, totalWords
} from '../utils/stats.js'
import EmptyState from '../components/EmptyState.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import Chip from '../components/Chip.jsx'

const WEEKDAYS = ['一', '', '三', '', '五', '', '日']

function heatColor(count) {
  if (count <= 0) return 'var(--c-border-tertiary)'
  if (count <= 2) return '#9FE1CB'
  if (count <= 5) return '#5DCAA5'
  return '#1D9E75'
}

export default function Review() {
  const navigate = useNavigate()
  const today = toDateStr(new Date())
  const courses = useLiveQuery(() => db.courses.toArray(), [], [])
  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [])
  const summaries = useLiveQuery(() => db.summaries.toArray(), [], [])

  const data = useMemo(() => {
    if (!lessons) return null
    const active = (courses || []).filter(c => c.status === 'active')
    return {
      streak: computeStreak(lessons, today),
      heat: heatmapData(lessons, today, 16),
      bars: thisWeekCounts(lessons, today),
      week: weekCompare(lessons, today),
      sentence: weekSentence(lessons, today),
      words: totalWords(summaries || []),
      doneTotal: lessons.filter(l => l.status === 'done').length,
      healths: active.map(c => ({ course: c, health: courseHealth(c, lessons, today) })),
      monthLabel: format(parseISO(today), 'M月d日 EEEE', { locale: zhCN })
    }
  }, [lessons, courses, summaries, today])

  if (!data) {
    return <div className="page"><EmptyState text="加载中…" /></div>
  }

  const maxBar = Math.max(1, ...data.bars.map(b => b.count))
  const behind = data.healths.filter(h => h.health.status === 'behind')

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← 返回</button>
        <div className="text-xs text-muted">{data.monthLabel}</div>
      </div>

      <div className="h1">学习复盘</div>

      {/* 关键数字 */}
      <div className="card mt-3">
        <div className="row" style={{ gap: 0 }}>
          {[
            ['连续学习', data.streak + ' 天'],
            ['本周', data.week.thisWeek + ' 节'],
            ['累计学完', data.doneTotal + ' 节'],
            ['总结字数', data.words]
          ].map(([label, value], i) => (
            <div key={label} style={{
              flex: 1, textAlign: 'center',
              borderLeft: i > 0 ? '1px solid var(--c-border-tertiary)' : 'none'
            }}>
              <div className="h2" style={{ fontSize: 18 }}>{value}</div>
              <div className="text-xs text-muted mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 热力图 */}
      <div className="section">
        <div className="section-title"><span>学习热力图 · 最近 16 周</span></div>
        <div className="card">
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="col" style={{ gap: 3, justifyContent: 'space-around' }}>
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="text-xs text-muted" style={{ height: 11, lineHeight: '11px', fontSize: 9 }}>{w}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateFlow: 'column', gridTemplateRows: 'repeat(7, 11px)', gap: 3, flex: 1 }}>
              {data.heat.days.map(d => (
                <div
                  key={d.date}
                  title={`${d.date} · ${d.count} 节`}
                  style={{
                    width: 11, height: 11, borderRadius: 2,
                    background: d.future ? 'transparent' : heatColor(d.count),
                    border: d.future ? '1px dashed var(--c-border-tertiary)' : 'none'
                  }}
                />
              ))}
            </div>
          </div>
          <div className="row gap-2 mt-3 text-xs text-muted" style={{ alignItems: 'center' }}>
            <span>少</span>
            {[0, 2, 4, 6].map(c => <span key={c} style={{ width: 11, height: 11, borderRadius: 2, background: heatColor(c), display: 'inline-block' }} />)}
            <span>多</span>
          </div>
        </div>
      </div>

      {/* 本周报告 */}
      <div className="section">
        <div className="section-title"><span>本周报告</span></div>
        <div className="card">
          <div className="row gap-2" style={{ alignItems: 'flex-end', height: 72 }}>
            {data.bars.map((b, i) => (
              <div key={b.date} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: Math.max(2, (b.count / maxBar) * 52),
                  background: b.count > 0 ? '#1D9E75' : 'var(--c-border-tertiary)',
                  borderRadius: '3px 3px 0 0'
                }} />
                <div className="text-xs text-muted mt-1" style={{ fontSize: 10 }}>{'一二三四五六日'[i]}</div>
              </div>
            ))}
          </div>
          <div className="text-sm text-soft mt-3">{data.sentence}</div>
        </div>
      </div>

      {/* 课程驾驶舱 */}
      <div className="section">
        <div className="section-title">
          <span>课程驾驶舱 ({data.healths.length} 门在读)</span>
        </div>
        {data.healths.length === 0 && <EmptyState text="没有在读的课程" />}
        <div className="col gap-3">
          {data.healths.map(({ course, health }) => (
            <div key={course.id} className="card" onClick={() => navigate(`/course/${course.id}`)} style={{ cursor: 'pointer' }}>
              <div className="row-between">
                <div className="h3" style={{ wordBreak: 'break-word' }}>{course.title}</div>
                {health.status === 'done' ? (
                  <Chip kind="success">已完成</Chip>
                ) : health.status === 'behind' ? (
                  <Chip kind="warning">落后 {health.daysBehind} 天</Chip>
                ) : (
                  <Chip kind="primary">正常</Chip>
                )}
              </div>
              <div className="mt-2">
                <ProgressBar value={health.doneCount} max={health.total} />
              </div>
              <div className="row-between mt-2 text-xs text-muted">
                <span>{health.doneCount} / {health.total} 节</span>
                <span>{health.perDay} 节/天</span>
              </div>
              {health.status !== 'done' && (
                <div className="text-xs text-muted mt-1">
                  还剩 {health.remaining} 节
                  {health.overdueCount > 0 && <> · <span className="text-warning">逾期 {health.overdueCount} 节</span></>}
                  {health.projectedFinish && <> · 按当前节奏预计 {health.projectedFinish} 学完</>}
                </div>
              )}
            </div>
          ))}
        </div>
        {behind.length > 0 && (
          <div className="text-xs text-warning mt-2">
            ⚠ {behind.length} 门课落后于原计划,可在课程详情页「改节奏」重新平衡
          </div>
        )}
      </div>
    </div>
  )
}
