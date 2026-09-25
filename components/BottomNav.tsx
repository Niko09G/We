'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useScrollSpy, type ScrollSpySection } from '@/hooks/useScrollSpy'

export type BottomNavItem = {
  id: string
  label: string
  targetId: string
  activeIconSrc: string
  inactiveIconSrc: string
  iconAlt: string
}

/** Lobby landing page — anchor jumps to in-page sections. */
export const LOBBY_BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  {
    id: 'seat-finder',
    label: 'Seat finder',
    targetId: 'seat-finder',
    activeIconSrc: '/nav/PinW.svg',
    inactiveIconSrc: '/nav/PinC.svg',
    iconAlt: 'Seat finder',
  },
  {
    id: 'program',
    label: 'Program',
    targetId: 'program',
    activeIconSrc: '/nav/MissionW.svg',
    inactiveIconSrc: '/nav/MissionC.svg',
    iconAlt: 'Program',
  },
  {
    id: 'mcs',
    label: "MC's",
    targetId: 'mcs',
    activeIconSrc: '/nav/HeartW.svg',
    inactiveIconSrc: '/nav/HeartC.svg',
    iconAlt: "MC's",
  },
  {
    id: 'teams',
    label: 'Teams',
    targetId: 'teams',
    activeIconSrc: '/nav/BarW.svg',
    inactiveIconSrc: '/nav/BarC.svg',
    iconAlt: 'Teams',
  },
]

/** Table mission page — anchor jumps; seat finder appears before leaderboard. */
export const MISSION_BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  {
    id: 'missions',
    label: 'Missions',
    targetId: 'missions',
    activeIconSrc: '/nav/MissionW.svg',
    inactiveIconSrc: '/nav/MissionC.svg',
    iconAlt: 'Missions',
  },
  {
    id: 'feed',
    label: 'Feed',
    targetId: 'feed',
    activeIconSrc: '/nav/HeartW.svg',
    inactiveIconSrc: '/nav/HeartC.svg',
    iconAlt: 'Feed',
  },
  {
    id: 'seat-finder',
    label: 'Seat finder',
    targetId: 'seat-finder',
    activeIconSrc: '/nav/PinW.svg',
    inactiveIconSrc: '/nav/PinC.svg',
    iconAlt: 'Seat finder',
  },
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    targetId: 'leaderboard',
    activeIconSrc: '/nav/BarW.svg',
    inactiveIconSrc: '/nav/BarC.svg',
    iconAlt: 'Leaderboard',
  },
]

const ACTIVE_CLASS =
  'flex min-w-[4.5rem] flex-col items-center justify-center gap-1 rounded-full bg-purple-600 px-3 py-2 text-[11px] font-medium text-white shadow-md transition-colors'
const INACTIVE_CLASS =
  'flex min-w-[4.5rem] flex-col items-center justify-center gap-1 rounded-full px-3 py-2 text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-200'

/** Keep scroll-spy paused through smooth programmatic scroll (~600ms or scrollend). */
const MANUAL_SCROLL_LOCK_MS = 600

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname()
  const manualNavLockRef = useRef(false)
  const manualScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualScrollEndHandlerRef = useRef<(() => void) | null>(null)
  const [manualActiveSection, setManualActiveSection] = useState<string | null>(null)

  const scrollSpySections = useMemo<ScrollSpySection[]>(
    () =>
      items.map((item) => ({
        id: item.id,
        targetId: item.targetId,
      })),
    [items],
  )

  const scrollSpyActive = useScrollSpy(scrollSpySections, {
    pausedRef: manualNavLockRef,
  })

  const activeId = manualActiveSection ?? scrollSpyActive

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

  useEffect(() => {
    clearManualScrollLock()
  }, [pathname])

  const handleItemClick = (item: BottomNavItem) => {
    beginManualScroll(item.id)
    const target = document.getElementById(item.targetId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      scheduleManualScrollRelease()
    } else {
      clearManualScrollLock()
    }
  }

  return (
    <nav
      className="fixed bottom-6 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-2 shadow-2xl backdrop-blur-md"
      aria-label="Section navigation"
    >
      {items.map((item) => {
        const isActive = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleItemClick(item)}
            aria-current={isActive ? 'true' : undefined}
            className={isActive ? ACTIVE_CLASS : INACTIVE_CLASS}
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
    </nav>
  )
}
