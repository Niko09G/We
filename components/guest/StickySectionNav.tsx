'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type StickySectionNavItem = {
  id: string
  label: string
  targetId: string
  activeIconSrc: string
  inactiveIconSrc: string
  iconAlt: string
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
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Must match the fade overlay width (in px) so the clicked item never sits under the fade.
  const FADE_OVERLAY_PX = 56
  // Extra padding inside the fade-safe window.
  const KEEP_READABLE_PADDING_PX = 10
  // Gradient for the active highlight pill.
  const ACTIVE_GRADIENT =
    'linear-gradient(to right, #17a3d6, #3869e9, #5f32f3)'

  const scrollTo = useCallback((targetId: string) => {
    const el = document.getElementById(targetId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const scrollRailToItem = useCallback(
    (id: string, behavior: ScrollBehavior) => {
      const rail = railRef.current
      const btn = buttonRefs.current[id]
      if (!rail || !btn) return

      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth)
      const clientWidth = rail.clientWidth
      const idx = items.findIndex((x) => x.id === id)
      if (idx < 0) return

      // Desired set: active + immediate neighbors (when possible).
      const desiredIdxs = [idx - 1, idx, idx + 1].filter(
        (n) => n >= 0 && n < items.length
      )

      const leftFadePx = idx > 1 ? FADE_OVERLAY_PX : 0
      const rightFadePx = idx < items.length - 2 ? FADE_OVERLAY_PX : 0

      const safeL = leftFadePx + KEEP_READABLE_PADDING_PX
      const safeR = clientWidth - rightFadePx - KEEP_READABLE_PADDING_PX

      const solveForSet = (indices: number[]) => {
        // Constraints:
        // itemLeft  >= x + safeL  -> x <= itemLeft - safeL
        // itemRight <= x + safeR -> x >= itemRight - safeR
        let lower = -Infinity
        let upper = Infinity

        for (const i of indices) {
          const el = buttonRefs.current[items[i]!.id]
          if (!el) continue
          const itemLeft = el.offsetLeft
          const itemRight = itemLeft + el.offsetWidth
          lower = Math.max(lower, itemRight - safeR)
          upper = Math.min(upper, itemLeft - safeL)
        }

        // Intersect with [0, maxScroll].
        lower = Math.max(0, lower)
        upper = Math.min(maxScroll, upper)
        if (lower > upper) return null

        const activeBtn = buttonRefs.current[id]
        if (!activeBtn) return null
        const activeLeft = activeBtn.offsetLeft
        const activeRight = activeLeft + activeBtn.offsetWidth
        const activeCenter = (activeLeft + activeRight) / 2
        const safeCenter = (safeL + safeR) / 2
        const ideal = activeCenter - safeCenter

        return Math.max(lower, Math.min(upper, ideal))
      }

      const next =
        solveForSet(desiredIdxs) ??
        solveForSet([idx]) ??
        rail.scrollLeft

      const clamped = Math.max(0, Math.min(maxScroll, next))
      if (Math.abs(clamped - rail.scrollLeft) < 0.5) return
      rail.scrollTo({ left: clamped, behavior })
    },
    [items]
  )

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
      if (!hasOverflow) {
        setCanScrollLeft(false)
        setCanScrollRight(false)
        return
      }
      // Use slightly larger thresholds to avoid “fade on” at rest.
      setCanScrollLeft(rail.scrollLeft > 10)
      setCanScrollRight(rail.scrollLeft < maxScroll - 10)
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
        className="relative mx-auto h-[72px] overflow-hidden rounded-[9999px] border border-zinc-200 bg-white p-1 shadow-[0_16px_34px_rgba(0,0,0,0.14)] backdrop-blur-sm"
        aria-label="Section navigation"
      >
        {/* Internal fades (both sides) */}
        {canScrollLeft ? (
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 z-[2] rounded-r-[9999px]"
            style={{ width: FADE_OVERLAY_PX }}
            aria-hidden
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/92 to-transparent" />
          </div>
        ) : null}
        {canScrollRight ? (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 z-[2] rounded-l-[9999px]"
            style={{ width: FADE_OVERLAY_PX }}
            aria-hidden
          >
            <div className="absolute inset-0 bg-gradient-to-l from-white/95 via-white/92 to-transparent" />
          </div>
        ) : null}

        {/* Quiet arrow hints (no bubble) */}
        {canScrollLeft ? (
          <div
            className="pointer-events-none absolute left-3 top-1/2 z-[4] -translate-y-1/2"
            aria-hidden
          >
            <span className="text-[28px] font-medium text-zinc-600/95">‹</span>
          </div>
        ) : null}
        {canScrollRight ? (
          <div
            className="pointer-events-none absolute right-3 top-1/2 z-[4] -translate-y-1/2"
            aria-hidden
          >
            <span className="text-[28px] font-medium text-zinc-600/95">›</span>
          </div>
        ) : null}

        <div
          ref={railRef}
          className="relative flex h-full w-full items-center gap-2 overflow-x-auto overscroll-x-contain overflow-y-hidden py-0 px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-y]"
        >
          {items.map((item) => {
            const isActive = item.id === activeId
            return (
              <button
                key={item.id}
                ref={(el) => {
                  buttonRefs.current[item.id] = el
                }}
                type="button"
                onClick={() => {
                  setActiveId(item.id)
                  manualActiveUntilRef.current = Date.now() + 800
                  scrollRailToItem(item.id, 'smooth')
                  scrollTo(item.targetId)
                }}
                className="group relative z-[5] flex h-14 min-w-[6.25rem] flex-col items-center justify-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors"
                style={
                  isActive
                    ? { backgroundImage: ACTIVE_GRADIENT, color: '#ffffff' }
                    : { color: '#000000', backgroundColor: 'transparent' }
                }
                aria-current={isActive ? 'true' : undefined}
              >
                <img
                  src={isActive ? item.activeIconSrc : item.inactiveIconSrc}
                  alt={item.iconAlt}
                  className="h-6 w-6 object-contain"
                  draggable={false}
                />
                <span className="leading-none whitespace-nowrap">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

