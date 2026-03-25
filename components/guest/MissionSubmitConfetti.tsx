'use client'

import { useEffect, useState, type CSSProperties } from 'react'

type Piece = {
  id: string
  tx: string
  ty: string
  rot: string
  delay: string
  color: string
  leftPct: string
}

/** Lightweight burst (~1s); pointer-events none; parent should be `relative`. */
export function MissionSubmitConfetti({ fireKey }: { fireKey: number }) {
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    if (fireKey <= 0) return
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduceMotion) return

    const colors = ['#8b5cf6', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#a3e635']
    const next: Piece[] = Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.35
      const dist = 36 + Math.random() * 48
      const tx = `${Math.cos(angle) * dist}px`
      const ty = `${Math.sin(angle) * dist - 18}px`
      const rot = `${(Math.random() - 0.5) * 200}deg`
      return {
        id: `${fireKey}-${i}`,
        tx,
        ty,
        rot,
        delay: `${i * 16}ms`,
        color: colors[i % colors.length]!,
        leftPct: `${42 + (Math.random() - 0.5) * 16}%`,
      }
    })
    setPieces(next)
    const t = window.setTimeout(() => setPieces([]), 1050)
    return () => window.clearTimeout(t)
  }, [fireKey])

  if (pieces.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-24 overflow-hidden"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-3 h-1.5 w-1 rounded-[1px] will-change-transform shadow-[0_0_1px_rgba(0,0,0,0.06)]"
          style={
            {
              left: p.leftPct,
              backgroundColor: p.color,
              animationDelay: p.delay,
              animation:
                'missionConfettiPiece 880ms cubic-bezier(0.2, 0.75, 0.25, 1) forwards',
              '--tx': p.tx,
              '--ty': p.ty,
              '--rot': p.rot,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
