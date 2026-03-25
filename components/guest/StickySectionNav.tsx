'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export type StickySectionNavItem = {
  id: string
  label: string
  targetId: string
  activeIcon: React.ReactNode
  inactiveIcon: React.ReactNode
}

export function StickySectionNav({
  items,
  heroContainerId,
  highlightColor,
}: {
  items: StickySectionNavItem[]
  /** Menu appears after this element scrolls out of view. */
  heroContainerId: string
  /** Active pill color (team theme for now). */
  highlightColor: string
}) {
  const [show, setShow] = useState(false)
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')

  const targets = useMemo(
    () =>
      items
        .map((i) => ({ id: i.id, el: document.getElementById(i.targetId) }))
        .filter((x): x is { id: string; el: HTMLElement } => Boolean(x.el)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.map((i) => `${i.id}:${i.targetId}`).join('|')]
  )

  useEffect(() => {
    const heroEl = document.getElementById(heroContainerId)
    if (!heroEl) {
      setShow(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (!e) return
        setShow(!e.isIntersecting || e.intersectionRatio < 0.12)
      },
      { threshold: [0, 0.12, 0.25] }
    )
    io.observe(heroEl)
    return () => io.disconnect()
  }, [heroContainerId])

  useEffect(() => {
    if (targets.length === 0) return

    const ratios = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.navId
          if (!id) continue
          ratios.set(id, e.isIntersecting ? e.intersectionRatio : 0)
        }

        // Pick the most “present” section; fallback to first.
        let bestId = activeId
        let best = -1
        for (const [id, r] of ratios.entries()) {
          if (r > best) {
            best = r
            bestId = id
          }
        }
        if (bestId) setActiveId(bestId)
      },
      {
        // Treat the middle band as “active” to reduce jitter.
        rootMargin: '-40% 0px -55% 0px',
        threshold: [0, 0.15, 0.3, 0.5, 0.8],
      }
    )

    for (const t of targets) {
      t.el.dataset.navId = t.id
      io.observe(t.el)
    }

    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets])

  const scrollTo = useCallback((targetId: string) => {
    const el = document.getElementById(targetId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div
      className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[60] w-[min(24rem,calc(100vw-1.25rem))] -translate-x-1/2 transition duration-300 ease-out ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0 pointer-events-none'
      }`}
      aria-hidden={!show}
    >
      <nav
        className="mx-auto flex items-center justify-between gap-1.5 rounded-[9999px] border border-white/20 bg-zinc-950/80 p-1.5 shadow-xl shadow-black/20 backdrop-blur-md"
        aria-label="Section navigation"
      >
        {items.map((item) => {
          const isActive = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollTo(item.targetId)}
              className={`group relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9999px] px-2.5 py-2 text-[11px] font-semibold transition ${
                isActive ? 'scale-[1.03] text-white' : 'text-white/80 hover:text-white'
              }`}
              style={
                isActive
                  ? { backgroundColor: highlightColor }
                  : undefined
              }
              aria-current={isActive ? 'true' : undefined}
            >
              <span
                className={`inline-flex h-4 w-4 items-center justify-center ${
                  isActive ? 'text-white' : ''
                }`}
                style={!isActive ? { color: highlightColor } : undefined}
                aria-hidden
              >
                {isActive ? item.activeIcon : item.inactiveIcon}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

