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

/** Subtle burst on the main photo canvas when points are awarded. */
export function DisplayConfetti({ fireKey }: { fireKey: number }) {
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    if (fireKey <= 0) return
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduceMotion) return

    const colors = ['#fbbf24', '#8b5cf6', '#34d399', '#f472b6', '#38bdf8', '#f59e0b']
    const next: Piece[] = Array.from({ length: 18 }, (_, i) => {
      const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
      const dist = 48 + Math.random() * 72
      const tx = `${Math.cos(angle) * dist}px`
      const ty = `${Math.sin(angle) * dist - 24}px`
      const rot = `${(Math.random() - 0.5) * 220}deg`
      return {
        id: `${fireKey}-${i}`,
        tx,
        ty,
        rot,
        delay: `${i * 12}ms`,
        color: colors[i % colors.length]!,
        leftPct: `${55 + (Math.random() - 0.5) * 30}%`,
      }
    })
    setPieces(next)
    const t = window.setTimeout(() => setPieces([]), 1100)
    return () => window.clearTimeout(t)
  }, [fireKey])

  if (pieces.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[25] overflow-hidden"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[38%] h-1.5 w-1 rounded-[1px] will-change-transform shadow-[0_0_1px_rgba(0,0,0,0.08)]"
          style={
            {
              left: p.leftPct,
              backgroundColor: p.color,
              animationDelay: p.delay,
              animation:
                'missionConfettiPiece 900ms cubic-bezier(0.2, 0.75, 0.25, 1) forwards',
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
