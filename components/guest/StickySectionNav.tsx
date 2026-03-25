'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const manualActiveUntilRef = useRef<number>(0)
  const railRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const targetElsRef = useRef<Array<{ id: string; el: HTMLElement }>>([])
  const [overflow, setOverflow] = useState(false)
  const [atEnd, setAtEnd] = useState(true)

  const overflowMaskEnabled = useMemo(() => overflow && !atEnd, [overflow, atEnd])

  const scrollTo = useCallback((targetId: string) => {
    const el = document.getElementById(targetId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Menu appears when the hero has been scrolled past a bit.
  useEffect(() => {
    const heroEl = document.getElementById(heroContainerId)
    heroRef.current = heroEl
    if (!heroEl) {
      setShow(true)
      return
    }

    const VISIBILITY_PROGRESS_THRESHOLD = 0.22 // ~20-30% past hero

    let raf = 0
    const update = () => {
      raf = 0
      const el = heroRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const h = rect.height || 1
      const progress = (-rect.top) / h
      setShow(progress >= VISIBILITY_PROGRESS_THRESHOLD)
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [heroContainerId])

  // Build target section list after mount.
  useEffect(() => {
    targetElsRef.current = items
      .map((i) => {
        const el = document.getElementById(i.targetId)
        if (!el) return null
        return { id: i.id, el }
      })
      .filter((x): x is { id: string; el: HTMLElement } => Boolean(x))

    // Reset active to first available target.
    setActiveId(items[0]?.id ?? '')
  }, [items])

  // Active section detection: choose the section whose top is closest to a “focus line”.
  useEffect(() => {
    let raf = 0
    const updateActive = () => {
      raf = 0
      if (Date.now() < manualActiveUntilRef.current) return

      const targets = targetElsRef.current
      if (targets.length === 0) return

      const focusLine = window.innerHeight * 0.48
      let bestId: string | null = null
      let bestDist = Number.POSITIVE_INFINITY

      for (const t of targets) {
        const rect = t.el.getBoundingClientRect()
        // Only consider items near the viewport.
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue
        const dist = Math.abs(rect.top - focusLine)
        if (dist < bestDist) {
          bestDist = dist
          bestId = t.id
        }
      }

      if (bestId && bestId !== activeIdRef.current) setActiveId(bestId)
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(updateActive)
    }

    updateActive()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  // Horizontal overflow detection for the menu rail.
  useEffect(() => {
    const el = railRef.current
    if (!el) return

    let raf = 0
    const updateOverflow = () => {
      raf = 0
      const rail = railRef.current
      if (!rail) return
      const maxScroll = rail.scrollWidth - rail.clientWidth
      const hasOverflow = maxScroll > 1
      setOverflow(hasOverflow)
      setAtEnd(!hasOverflow || rail.scrollLeft >= maxScroll - 4)
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(updateOverflow)
    }

    updateOverflow()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(() => updateOverflow())
    ro.observe(el)

    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [items])

  return (
    <div
      className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[60] w-[min(26rem,calc(100vw-1.25rem))] -translate-x-1/2 transition-all duration-300 ease-out ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'
      }`}
      aria-hidden={!show}
    >
      <nav
        className="relative mx-auto rounded-[9999px] border border-zinc-200 bg-white/95 p-2 shadow-[0_10px_28px_rgba(0,0,0,0.10)] backdrop-blur"
        aria-label="Section navigation"
      >
        <div
          ref={railRef}
          className="flex max-w-full items-center gap-2 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => {
            const isActive = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveId(item.id)
                  manualActiveUntilRef.current = Date.now() + 650
                  scrollTo(item.targetId)
                }}
                className="group relative flex min-w-[5.75rem] flex-col items-center justify-center gap-1 rounded-[9999px] px-2 py-2.5 text-[11px] font-semibold transition-transform active:scale-[0.98]"
                style={
                  isActive
                    ? { backgroundColor: highlightColor, color: '#ffffff' }
                    : { color: highlightColor }
                }
                aria-current={isActive ? 'true' : undefined}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center" aria-hidden>
                  {isActive ? item.activeIcon : item.inactiveIcon}
                </span>
                <span className="leading-none">{item.label}</span>
              </button>
            )
          })}
        </div>

        {overflowMaskEnabled ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-14"
              aria-hidden
            >
              <div className="absolute inset-0 bg-gradient-to-l from-white/95 to-transparent" />
            </div>
            <div
              className="pointer-events-none absolute right-3 top-1/2 z-[1] -translate-y-1/2"
              aria-hidden
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-zinc-500 shadow-sm">
                ›
              </span>
            </div>
          </>
        ) : null}
      </nav>
    </div>
  )
}

