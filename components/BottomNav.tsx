'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type BottomNavItem = {
  id: string
  label: string
  href: string
  activeIconSrc: string
  inactiveIconSrc: string
  iconAlt: string
}

/** Lobby landing page — in-page section links and dedicated routes. */
export const LOBBY_BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  {
    id: 'seat-finder',
    label: 'Seat finder',
    href: '/#seat-finder',
    activeIconSrc: '/nav/PinW.svg',
    inactiveIconSrc: '/nav/PinC.svg',
    iconAlt: 'Seat finder',
  },
  {
    id: 'program',
    label: 'Program',
    href: '/program',
    activeIconSrc: '/nav/MissionW.svg',
    inactiveIconSrc: '/nav/MissionC.svg',
    iconAlt: 'Program',
  },
  {
    id: 'mcs',
    label: "MC's",
    href: '/#mcs',
    activeIconSrc: '/nav/HeartW.svg',
    inactiveIconSrc: '/nav/HeartC.svg',
    iconAlt: "MC's",
  },
  {
    id: 'teams',
    label: 'Teams',
    href: '/#teams',
    activeIconSrc: '/nav/BarW.svg',
    inactiveIconSrc: '/nav/BarC.svg',
    iconAlt: 'Teams',
  },
]

const CONTAINER_CLASS =
  'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-3 py-2 bg-slate-900/90 backdrop-blur-md rounded-full border border-slate-800 shadow-2xl flex items-center gap-1 select-none'
const ACTIVE_CLASS =
  'bg-purple-600/20 text-purple-400 border border-purple-500/30 px-4 py-2 rounded-full font-medium flex items-center gap-2'
const INACTIVE_CLASS =
  'text-slate-400 hover:text-slate-200 px-4 py-2 rounded-full font-medium flex items-center gap-2'

/** Table mission page — in-page section links for a specific table. */
export function getMissionBottomNavItems(tableId: string): BottomNavItem[] {
  const base = `/missions/${tableId}`

  return [
    {
      id: 'missions',
      label: 'Missions',
      href: `${base}#missions`,
      activeIconSrc: '/nav/MissionW.svg',
      inactiveIconSrc: '/nav/MissionC.svg',
      iconAlt: 'Missions',
    },
    {
      id: 'feed',
      label: 'Feed',
      href: `${base}#feed`,
      activeIconSrc: '/nav/HeartW.svg',
      inactiveIconSrc: '/nav/HeartC.svg',
      iconAlt: 'Feed',
    },
    {
      id: 'seat-finder',
      label: 'Seat finder',
      href: `${base}#seat-finder`,
      activeIconSrc: '/nav/PinW.svg',
      inactiveIconSrc: '/nav/PinC.svg',
      iconAlt: 'Seat finder',
    },
    {
      id: 'leaderboard',
      label: 'Leaderboard',
      href: `${base}#leaderboard`,
      activeIconSrc: '/nav/BarW.svg',
      inactiveIconSrc: '/nav/BarC.svg',
      iconAlt: 'Leaderboard',
    },
  ]
}

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className={CONTAINER_CLASS} aria-label="Section navigation">
      {items.map((item) => {
        const isActive = pathname === item.href

        return (
          <Link
            key={item.id}
            href={item.href}
            prefetch={true}
            aria-current={isActive ? 'page' : undefined}
            className={isActive ? ACTIVE_CLASS : INACTIVE_CLASS}
          >
            <img
              src={isActive ? item.activeIconSrc : item.inactiveIconSrc}
              alt={item.iconAlt}
              className="h-6 w-6 object-contain"
              draggable={false}
            />
            <span className="leading-none">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
