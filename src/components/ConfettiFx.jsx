import { useEffect, useState } from 'react'
import { useFeedbackFx } from '../utils/feedback.js'

const COLORS = ['#1D9E75', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6', '#10B981']
function randomBetween(a, b) { return Math.random() * (b - a) + a }

export default function ConfettiFx() {
  const confetti = useFeedbackFx((s) => s.confetti)
  const [pieces, setPieces] = useState([])

  useEffect(() => {
    if (confetti <= 0) return
    const newPieces = []
    for (let i = 0; i < confetti; i++) {
      newPieces.push({
        id: `${Date.now()}_${i}`,
        x: randomBetween(0, window.innerWidth),
        y: -20,
        vx: randomBetween(-2, 2),
        vy: randomBetween(2, 5),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: randomBetween(-180, 180),
        vr: randomBetween(-8, 8)
      })
    }
    setPieces(prev => [...prev, ...newPieces])
    let raf
    let stopped = false
    const tick = () => {
      if (stopped) return
      setPieces(prev => prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15,
          rot: p.rot + p.vr
        }))
        .filter(p => p.y < window.innerHeight + 40)
      )
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [confetti])

  // 缓退
  useEffect(() => {
    if (pieces.length === 0) return
    const t = setTimeout(() => setPieces([]), 2500)
    return () => clearTimeout(t)
  }, [pieces.length])

  return (
    <>
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.x,
            top: p.y,
            background: p.color,
            transform: `rotate(${p.rot}deg)`
          }}
        />
      ))}
    </>
  )
}
