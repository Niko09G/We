'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useScrollSpy, type ScrollSpySection } from '@/hooks/useScrollSpy'

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

/** Keep scroll-spy paused through smooth programmatic scroll (~600ms or scrollend). */
const MANUAL_SCROLL_LOCK_MS = 600

export function StickySectionNav({
  items,
  heroContainerId,
  highlightColor,
}: {
  items: StickySectionNavItem[]
  heroContainerId: string
  highlightColor: string
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const manualNavLockRef = useRef(false)
  const manualScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualScrollEndHandlerRef = useRef<(() => void) | null>(null)
  const [show, setShow] = useState(false)
  const [overlayActive, setOverlayActive] = useState(false)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const [showRightFade, setShowRightFade] = useState(false)
  const [manualActiveSection, setManualActiveSection] = useState<string | null>(null)

  const scrollSpySections = useMemo<ScrollSpySection[]>(
    () =>
      items.map((item) => ({
        id: item.id,
        targetId: item.targetId,
      })),
    [items]
  )

  const scrollSpyActive = useScrollSpy(scrollSpySections, {
    pausedRef: manualNavLockRef,
  })

  const activeSection = manualActiveSection ?? scrollSpyActive

  const clearManualScrollLock = () => {
    if (manualScrollTimerRef.current) {
      clearTimeout(manualScrollTimerRef.current)
      manualScrollTimerRef.current = null
    }
    if (manualScrollEndHandlerRef.current) {
      window.removeEventListener('scrollend', manualScrollEndHandlerRef.current)
      manualScrollEndHandlerRef.current = null
    }
    manualNavLockRef.current = false
    setManualActiveSection(null)
  }

  const releaseManualScrollLock = () => {
    if (!manualNavLockRef.current) return
    clearManualScrollLock()
  }

  const beginManualScroll = (sectionId: string) => {
    clearManualScrollLock()
    manualNavLockRef.current = true
    setManualActiveSection(sectionId)
  }

  const scheduleManualScrollRelease = () => {
    if (manualScrollTimerRef.current) {
      clearTimeout(manualScrollTimerRef.current)
    }
    manualScrollTimerRef.current = setTimeout(() => {
      manualScrollTimerRef.current = null
      releaseManualScrollLock()
    }, MANUAL_SCROLL_LOCK_MS)

    const onScrollEnd = () => {
      releaseManualScrollLock()
    }
    if (manualScrollEndHandlerRef.current) {
      window.removeEventListener('scrollend', manualScrollEndHandlerRef.current)
    }
    manualScrollEndHandlerRef.current = onScrollEnd
    window.addEventListener('scrollend', onScrollEnd)
  }

  useEffect(() => {
    return () => clearManualScrollLock()
  }, [])

  // Keep prop for future theming wiring; currently active uses fixed gradient.
  void highlightColor

  // Show shortly after moving away from hero.
  useEffect(() => {
    const hero = document.getElementById(heroContainerId)
    if (!hero) {
      setShow(true)
      return
    }

    const THRESHOLD = 0.2
    let raf = 0
    const update = () => {
      raf = 0
      const rect = hero.getBoundingClientRect()
      const h = rect.height || 1
      const progress = (-rect.top) / h
      setShow(progress >= THRESHOLD)
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

  // Hide nav when any modal/lightbox is open.
  useEffect(() => {
    const compute = () => {
      setOverlayActive(Boolean(document.querySelector('[aria-modal="true"]')))
    }
    compute()
    const mo = new MutationObserver(compute)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true })
    return () => mo.disconnect()
  }, [])

  // Keep active item visible naturally by centering it in the rail.
  useEffect(() => {
    const activeEl = itemRefs.current[activeSection]
    if (!activeEl) return
    activeEl.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [activeSection])

  // Fade visibility based on hidden overflow in either direction.
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return

    let raf = 0
    const update = () => {
      raf = 0
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth)
      if (maxScroll <= 1) {
        setShowLeftFade(false)
        setShowRightFade(false)
        return
      }
      setShowLeftFade(rail.scrollLeft > 6)
      setShowRightFade(rail.scrollLeft < maxScroll - 6)
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(update)
    }

    update()
    rail.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(rail)

    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      rail.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [])

  const visible = show && !overlayActive

  const itemClass =
    'relative z-[3] flex h-14 min-w-[6.25rem] flex-col items-center justify-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap transition-colors duration-100 ease-out'

  const dockClass = useMemo(
    () =>
      `overflow-visible transition-[transform,opacity] duration-300 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-8 opacity-0 pointer-events-none'
      }`,
    [visible]
  )

  return (
    <div className={dockClass} aria-hidden={!visible}>
      <nav
        className="pointer-events-auto relative h-[72px] overflow-visible rounded-[9999px] border border-zinc-200 bg-white p-1 shadow-[0_4px_12px_rgba(0,0,0,0.07)]"
        aria-label="Section navigation"
      >
        <div className="relative h-full overflow-hidden rounded-[9999px]">
        {showLeftFade ? (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-[1] w-12 rounded-r-[9999px]">
            <div className="absolute inset-0 bg-gradient-to-r from-white/98 via-white/92 to-transparent" />
          </div>
        ) : null}
        {showRightFade ? (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-[1] w-12 rounded-l-[9999px]">
            <div className="absolute inset-0 bg-gradient-to-l from-white/98 via-white/92 to-transparent" />
          </div>
        ) : null}

        {showLeftFade ? (
          <div className="pointer-events-none absolute left-2.5 top-1/2 z-[2] -translate-y-1/2" aria-hidden>
            <span className="text-[22px] font-medium text-zinc-600/95">‹</span>
          </div>
        ) : null}
        {showRightFade ? (
          <div className="pointer-events-none absolute right-2.5 top-1/2 z-[2] -translate-y-1/2" aria-hidden>
            <span className="text-[22px] font-medium text-zinc-600/95">›</span>
          </div>
        ) : null}

        <div
          ref={railRef}
          className="flex h-full items-center gap-2 overflow-x-auto overflow-y-hidden px-0 [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => {
            const isActive = item.id === activeSection
            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[item.id] = el
                }}
                type="button"
                onClick={() => {
                  beginManualScroll(item.id)
                  const target = document.getElementById(item.targetId)
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    scheduleManualScrollRelease()
                  } else {
                    clearManualScrollLock()
                  }
                }}
                aria-current={isActive ? 'true' : undefined}
                className={`${itemClass} ${isActive ? 'text-white' : 'text-black'}`}
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
                <span className="leading-none">{item.label}</span>
              </button>
            )
          })}
        </div>
        </div>
      </nav>
    </div>
  )
}

