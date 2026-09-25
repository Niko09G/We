'use client'

import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'

export type BottomNavItem = {
  id: string
  label: string
  targetId: string
  /** When set, item is active when `usePathname()` matches this path (or a nested segment). */
  href?: string
}

/** Lobby landing page — anchor jumps to in-page sections. */
export const LOBBY_BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { id: 'seat-finder', label: 'Seat finder', targetId: 'seat-finder' },
  { id: 'program', label: 'Program', targetId: 'program' },
  { id: 'mcs', label: "MC's", targetId: 'mcs' },
  { id: 'teams', label: 'Teams', targetId: 'teams' },
]

/** Table mission page — anchor jumps; seat finder appears before leaderboard. */
export const MISSION_BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { id: 'missions', label: 'Missions', targetId: 'missions' },
  { id: 'feed', label: 'Feed', targetId: 'feed' },
  { id: 'seat-finder', label: 'Seat finder', targetId: 'seat-finder' },
  { id: 'leaderboard', label: 'Leaderboard', targetId: 'leaderboard' },
]

const ACTIVE_CLASS =
  'bg-purple-600 text-white shadow-md px-4 py-2 rounded-full text-xs font-medium transition-colors'
const INACTIVE_CLASS =
  'text-slate-400 hover:text-slate-200 px-4 py-2 rounded-full text-xs font-medium transition-colors'

function subscribeToHash(onStoreChange: () => void) {
  window.addEventListener('hashchange', onStoreChange)
  return () => window.removeEventListener('hashchange', onStoreChange)
}

function getHashSnapshot() {
  return window.location.hash.replace(/^#/, '')
}

function getServerHashSnapshot() {
  return ''
}

function useUrlHash() {
  return useSyncExternalStore(subscribeToHash, getHashSnapshot, getServerHashSnapshot)
}

function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function getActiveItemId(
  pathname: string,
  hash: string,
  items: BottomNavItem[],
): string | null {
  const hrefMatch = items.find((item) => item.href && isPathActive(pathname, item.href))
  if (hrefMatch) return hrefMatch.id

  if (hash) {
    const hashMatch = items.find((item) => item.id === hash || item.targetId === hash)
    if (hashMatch) return hashMatch.id
  }

  return null
}

function scrollToSection(pathname: string, targetId: string) {
  const target = document.getElementById(targetId)
  if (!target) return

  target.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const nextHash = `#${targetId}`
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, '', `${pathname}${nextHash}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname()
  const hash = useUrlHash()
  const activeId = getActiveItemId(pathname, hash, items)

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
            onClick={() => scrollToSection(pathname, item.targetId)}
            aria-current={isActive ? 'true' : undefined}
            className={isActive ? ACTIVE_CLASS : INACTIVE_CLASS}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
