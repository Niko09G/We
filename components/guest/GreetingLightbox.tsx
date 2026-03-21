'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GreetingRow } from '@/lib/greetings-admin'
import { greetingSenderLabel } from '@/lib/greeting-display'

type Props = {
  items: GreetingRow[]
  index: number
  open: boolean
  onClose: () => void
  onIndexChange: (i: number) => void
}

function ImageMain({
  src,
  alt,
}: {
  src: string
  alt: string
}) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div
        className="flex max-h-[55vh] w-full max-w-lg items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500"
        style={{ minHeight: '200px' }}
      >
        Image unavailable
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="max-h-[55vh] w-full max-w-lg rounded-2xl object-contain shadow-2xl"
      onError={() => setFailed(true)}
    />
  )
}

export function GreetingLightbox({
  items,
  index,
  open,
  onClose,
  onIndexChange,
}: Props) {
  const touchStartX = useRef<number | null>(null)
  const safeIndex = items.length ? Math.min(Math.max(0, index), items.length - 1) : 0
  const g = items[safeIndex]

  const goPrev = useCallback(() => {
    if (items.length < 2) return
    onIndexChange(safeIndex <= 0 ? items.length - 1 : safeIndex - 1)
  }, [items.length, onIndexChange, safeIndex])

  const goNext = useCallback(() => {
    if (items.length < 2) return
    onIndexChange(safeIndex >= items.length - 1 ? 0 : safeIndex + 1)
  }, [items.length, onIndexChange, safeIndex])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, goPrev, goNext])

  if (!open || !g) return null

  const accent = g.table_color?.trim() || null
  const isMission = g.source_type === 'mission'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Greeting"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          const start = touchStartX.current
          touchStartX.current = null
          if (start == null) return
          const end = e.changedTouches[0]?.clientX
          if (end == null) return
          const d = end - start
          if (d > 56) goPrev()
          else if (d < -56) goNext()
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <span className="text-xs font-medium text-white/50">
            {safeIndex + 1} / {items.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <div className="flex justify-center">
            <ImageMain src={g.image_url} alt="" />
          </div>

          <div
            className="mt-4 rounded-2xl border px-4 py-3"
            style={{
              borderColor: isMission && accent ? `${accent}55` : 'rgba(255,255,255,0.12)',
              backgroundColor:
                isMission && accent ? `${accent}12` : 'rgba(255,255,255,0.04)',
            }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              {isMission && accent ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />
              ) : null}
              {greetingSenderLabel(g)}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
              {g.message}
            </p>
          </div>
        </div>

        {items.length > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2 py-2">
            <button
              type="button"
              onClick={goPrev}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Next →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
