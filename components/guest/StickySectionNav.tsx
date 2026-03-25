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

const ACTIVE_GRADIENT =
  'linear-gradient(to right, #17a3d6, #3869e9, #5f32f3)'

export function StickySectionNav({
  items,
  heroContainerId,
  highlightColor,
}: {
  items: StickySectionNavItem[]
  /** Menu appears shortly after the hero starts being scrolled away. */
  heroContainerId: string
  /** Kept for future theming; currently not used for the gradient bubble. */
  highlightColor: string
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const [show, setShow] = useState(false)
  const [overlayActive, setOverlayActive] = useState(false)

  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')
  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const [tx, setTx] = useState(0) // controlled dock translation
  const txRef = useRef(0)
  useEffect(() => {
    txRef.current = tx
  }, [tx])

  // Fades show when there is overflow on that side.
  const [leftOverflow, setLeftOverflow] = useState(false)
  const [rightOverflow, setRightOverflow] = useState(false)

  // Overlay/lightbox suppression: hide nav if any aria-modal dialog exists.
  useEffect(() => {
    const compute = () => {
      const exists = Boolean(document.querySelector('[aria-modal="true"]'))
      setOverlayActive(exists)
    }
    compute()

    const mo = new MutationObserver(() => compute())
    mo.observe(document.body, { childList: true, subtree: true })

    return () => mo.disconnect()
  }, [])

  // Menu appearance: show once the hero has been scrolled away ~20-30%.
  useEffect(() => {
    const heroEl = document.getElementById(heroContainerId)
    if (!heroEl) {
      setShow(true)
      return
    }

    const VISIBILITY_PROGRESS_THRESHOLD = 0.22

    let raf = 0
    const update = () => {
      raf = 0
      const rect = heroEl.getBoundingClientRect()
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

  // Active section detection based on scroll position.
  useEffect(() => {
    const targets = items
      .map((i) => {
        const el = document.getElementById(i.targetId)
        return el ? { id: i.id, el } : null
      })
      .filter((x): x is { id: string; el: HTMLElement } => Boolean(x))

    let raf = 0
    const focusLine = () => window.innerHeight * 0.48

    const updateActive = () => {
      raf = 0
      const line = focusLine()

      let bestId: string | null = null
      let bestDist = Number.POSITIVE_INFINITY

      for (const t of targets) {
        const rect = t.el.getBoundingClientRect()
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue
        const d = Math.abs(rect.top - line)
        if (d < bestDist) {
          bestDist = d
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
  }, [items])

  const scrollToSection = useCallback((targetId: string) => {
    const el = document.getElementById(targetId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Controlled dock translation:
  // - never depends on raw horizontal scrolling
  // - always ensures active is fully visible and keeps neighbors fully visible when possible
  const repositionDockForActive = useCallback(() => {
    const outer = outerRef.current
    const row = rowRef.current
    if (!outer || !row) return

    const outerWidth = outer.clientWidth
    if (outerWidth <= 0) return

    const FADE_PX = 56
    const INNER_PAD_PX = 8 // breathing room inside safe window

    // Measure content bounds from buttons (offsetLeft unaffected by transform).
    const measured = items
      .map((it) => {
        const btn = btnRefs.current[it.id]
        if (!btn) return null
        return { id: it.id, left: btn.offsetLeft, width: btn.offsetWidth }
      })
      .filter((x): x is { id: string; left: number; width: number } => Boolean(x))

    if (measured.length === 0) return

    const byId = new Map(measured.map((m) => [m.id, m]))
    const activeIdx = items.findIndex((x) => x.id === activeIdRef.current)

    // Content width and translation bounds.
    const contentLeft = Math.min(...measured.map((m) => m.left))
    const contentRight = Math.max(...measured.map((m) => m.left + m.width))
    const contentWidth = contentRight - contentLeft

    const minTx = Math.min(0, outerWidth - contentWidth) // most negative (right aligned)
    const maxTx = 0 // left aligned

    // Safe viewport where items must fully fit.
    const safeL = FADE_PX + INNER_PAD_PX
    const safeR = outerWidth - FADE_PX - INNER_PAD_PX

    // Desired indices based on the required rules.
    const baseDesiredIdxs = (() => {
      if (activeIdx <= 0) return [0, 1] // Missions active → Feed visible
      if (activeIdx === 1) return [0, 1, 2] // Feed active → Missions + Seat Finder visible
      if (activeIdx === 2) return [1, 2, 3] // Seat Finder active → Feed + Leaderboard visible
      return [2, 3] // Leaderboard active → Seat Finder visible
    })().filter((n) => n >= 0 && n < items.length)

    const computeLowerUpper = (indices: number[]) => {
      let lower = -Infinity
      let upper = Infinity

      for (const di of indices) {
        const it = items[di]!
        const m = byId.get(it.id)
        if (!m) continue

        // ScreenLeft = m.left - contentLeft + tx
        // Ensure ScreenLeft >= safeL  -> tx >= safeL - (m.left - contentLeft)
        // Ensure ScreenRight <= safeR -> tx <= safeR - (m.left - contentLeft + m.width)
        const localLeft = m.left - contentLeft
        const localRight = localLeft + m.width

        lower = Math.max(lower, safeL - localLeft)
        upper = Math.min(upper, safeR - localRight)
      }

      if (!Number.isFinite(lower)) lower = minTx
      if (!Number.isFinite(upper)) upper = maxTx

      return { lower, upper }
    }

    let desiredIdxs = baseDesiredIdxs
    let lowerUpper = computeLowerUpper(desiredIdxs)

    // If the “neighbors fully visible” constraints can’t all be satisfied,
    // fall back to active-only so the active item is never cut off.
    if (lowerUpper.lower > lowerUpper.upper) {
      desiredIdxs = [activeIdx].filter((n) => n >= 0 && n < items.length)
      lowerUpper = computeLowerUpper(desiredIdxs)
    }

    // Keep active roughly centered inside the safe window (within constraints).
    const active = items[activeIdx] ? byId.get(items[activeIdx]!.id) : undefined
    if (!active) {
      setTx(0)
      return
    }

    const activeLocalLeft = active.left - contentLeft
    const activeLocalCenter = activeLocalLeft + active.width / 2
    const safeCenter = (safeL + safeR) / 2
    const idealTx = safeCenter - activeLocalCenter

    const chosen = Math.max(lowerUpper.lower, Math.min(lowerUpper.upper, idealTx))
    const clamped = Math.max(minTx, Math.min(maxTx, chosen))
    const finalTx = Number.isFinite(clamped) ? clamped : 0

    setTx(finalTx)

    // Fade visibility from tx bounds.
    const shiftedRightEdge = contentWidth + finalTx
    const rightOverflowNow = shiftedRightEdge > outerWidth + 0.5
    const leftOverflowNow = finalTx < -0.5

    setLeftOverflow(leftOverflowNow)
    setRightOverflow(rightOverflowNow)
  }, [items])

  // Reposition whenever active changes or on resize.
  useEffect(() => {
    repositionDockForActive()

    const onResize = () => repositionDockForActive()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [repositionDockForActive, activeId])

  // Controlled dock also needs to respond immediately to click.
  const onNavClick = useCallback(
    (id: string, targetId: string) => {
      if (id === activeIdRef.current) {
        scrollToSection(targetId)
        return
      }

      setActiveId(id)
      // Reposition immediately based on new activeId.
      // (Effect runs immediately too, but this removes perceptible lag.)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      requestAnimationFrame(() => repositionDockForActive())
      scrollToSection(targetId)
    },
    [repositionDockForActive, scrollToSection]
  )

  const visible = show && !overlayActive

  return (
    <div
      ref={outerRef}
      className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[60] w-[min(26rem,calc(100vw-1.25rem))] -translate-x-1/2 ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-8 opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      <nav
        className="relative h-[72px] overflow-hidden rounded-[9999px] border border-zinc-200 bg-white p-1 shadow-[0_16px_34px_rgba(0,0,0,0.14)] backdrop-blur-sm"
        aria-label="Section navigation"
      >
        {/* LEFT fade: shown when there is overflow hidden on the left */}
        {leftOverflow ? (
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 z-[1] rounded-r-[9999px]"
            style={{ width: 56 }}
            aria-hidden
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/98 via-white/92 to-transparent" />
          </div>
        ) : null}

        {/* RIGHT fade */}
        {rightOverflow ? (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 z-[1] rounded-l-[9999px]"
            style={{ width: 56 }}
            aria-hidden
          >
            <div className="absolute inset-0 bg-gradient-to-l from-white/98 via-white/92 to-transparent" />
          </div>
        ) : null}

        {/* Quiet arrows on top of fade areas */}
        {leftOverflow ? (
          <div className="pointer-events-none absolute left-3 top-1/2 z-[3] -translate-y-1/2" aria-hidden>
            <span className="text-[28px] font-medium text-zinc-600/95">‹</span>
          </div>
        ) : null}
        {rightOverflow ? (
          <div className="pointer-events-none absolute right-3 top-1/2 z-[3] -translate-y-1/2" aria-hidden>
            <span className="text-[28px] font-medium text-zinc-600/95">›</span>
          </div>
        ) : null}

        {/* Dock row */}
        <div
          ref={rowRef}
          className="relative flex h-full items-center gap-2 px-0"
          style={{
            transform: `translateX(${tx}px)`,
            touchAction: 'pan-y',
          }}
        >
          {items.map((item) => {
            const isActive = item.id === activeId
            return (
              <button
                key={item.id}
                ref={(el) => {
                  btnRefs.current[item.id] = el
                }}
                type="button"
                onClick={() => onNavClick(item.id, item.targetId)}
                aria-current={isActive ? 'true' : undefined}
                className={`relative z-[4] flex h-14 min-w-[6.25rem] flex-col items-center justify-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors ${
                  isActive ? 'text-white' : 'text-[#000]'
                }`}
                style={{
                  backgroundImage: isActive ? ACTIVE_GRADIENT : 'none',
                  backgroundColor: 'transparent',
                }}
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

