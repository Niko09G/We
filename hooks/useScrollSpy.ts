'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

export type ScrollSpySection = {
  /** Nav item id (may differ from DOM section id). */
  id: string
  /** `id` attribute on the scroll target element. */
  targetId: string
}

const DEFAULT_OFFSET_RATIO = 0.22

function pickActiveSection(
  sections: ScrollSpySection[],
  offsetPx: number
): string | null {
  let active: string | null = null
  for (const section of sections) {
    const el = document.getElementById(section.targetId)
    if (!el) continue
    const top = el.getBoundingClientRect().top
    if (top <= offsetPx) {
      active = section.id
    }
  }
  return active ?? sections[0]?.id ?? null
}

/**
 * Tracks which in-page section is active while scrolling (lobby + mission pages).
 * Uses scroll position with IntersectionObserver as a secondary signal.
 */
export function useScrollSpy(
  sections: ScrollSpySection[],
  options?: {
    pausedRef?: RefObject<boolean>
    offsetRatio?: number
  }
): string {
  const pausedRef = options?.pausedRef
  const offsetRatio = options?.offsetRatio ?? DEFAULT_OFFSET_RATIO
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '')
  const activeRef = useRef(activeId)
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  useEffect(() => {
    activeRef.current = activeId
  }, [activeId])

  useEffect(() => {
    if (sections.length === 0) return

    const ratios = new Map<string, number>()
    let raf = 0

    const applyScrollPick = () => {
      if (pausedRef?.current) return
      const offsetPx = window.innerHeight * offsetRatio
      const picked = pickActiveSection(sectionsRef.current, offsetPx)
      if (picked && picked !== activeRef.current) {
        activeRef.current = picked
        setActiveId(picked)
      }
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        applyScrollPick()
      })
    }

    const targets = sections
      .map((s) => {
        const el = document.getElementById(s.targetId)
        return el ? { id: s.id, el } : null
      })
      .filter((x): x is { id: string; el: HTMLElement } => Boolean(x))

    const io =
      targets.length > 0
        ? new IntersectionObserver(
            (entries) => {
              if (pausedRef?.current) return

              for (const entry of entries) {
                const id = (entry.target as HTMLElement).dataset.scrollSpyId
                if (!id) continue
                ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0)
              }

              let bestId: string | null = null
              let bestRatio = -1
              for (const [id, ratio] of ratios.entries()) {
                if (ratio > bestRatio) {
                  bestRatio = ratio
                  bestId = id
                }
              }

              if (bestId && bestRatio > 0.05 && bestId !== activeRef.current) {
                activeRef.current = bestId
                setActiveId(bestId)
              }
            },
            {
              threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1],
              rootMargin: '-18% 0px -42% 0px',
            }
          )
        : null

    for (const t of targets) {
      t.el.dataset.scrollSpyId = t.id
      io?.observe(t.el)
    }

    applyScrollPick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      io?.disconnect()
    }
  }, [sections, offsetRatio, pausedRef])

  return activeId
}
