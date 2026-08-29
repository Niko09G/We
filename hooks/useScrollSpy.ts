'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

export type ScrollSpySection = {
  /** Nav item id (may differ from DOM section id). */
  id: string
  /** `id` attribute on the scroll target element. */
  targetId: string
}

const DEFAULT_OFFSET_RATIO = 0.3
const SCROLL_DEBOUNCE_MS = 15

/** Single focal line in document space: scrollY + innerHeight * ratio. */
function focalLineViewportY(offsetRatio: number): number {
  return window.innerHeight * offsetRatio
}

/**
 * Pick exactly one section using a single focal-line check.
 * Prefer the section whose span contains the line; otherwise the last section above it.
 */
function pickActiveSection(
  sections: ScrollSpySection[],
  triggerLineViewportY: number
): string | null {
  let lastAbove: string | null = null

  for (const section of sections) {
    const el = document.getElementById(section.targetId)
    if (!el) continue

    const rect = el.getBoundingClientRect()
    if (rect.top <= triggerLineViewportY && rect.bottom > triggerLineViewportY) {
      return section.id
    }
    if (rect.top <= triggerLineViewportY) {
      lastAbove = section.id
    }
  }

  return lastAbove ?? sections[0]?.id ?? null
}

/**
 * Tracks which in-page section is active while scrolling (lobby + mission pages).
 * Uses a single focal-line check for deterministic section selection.
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

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const applyScrollPick = () => {
      if (pausedRef?.current) return

      const triggerLineViewportY = focalLineViewportY(offsetRatio)
      const picked = pickActiveSection(sectionsRef.current, triggerLineViewportY)
      if (picked && picked !== activeRef.current) {
        activeRef.current = picked
        setActiveId(picked)
      }
    }

    const onScroll = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        applyScrollPick()
      }, SCROLL_DEBOUNCE_MS)
    }

    applyScrollPick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [sections, offsetRatio, pausedRef])

  return activeId
}
