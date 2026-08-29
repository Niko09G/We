'use client'

import {
  StickySectionNav,
  type StickySectionNavItem,
} from '@/components/guest/StickySectionNav'

/** Scroll-spy section tracking is handled via `useScrollSpy` inside StickySectionNav. */

/** Lobby landing page — anchor jumps to in-page sections. */
export const LOBBY_BOTTOM_NAV_ITEMS: StickySectionNavItem[] = [
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
export const MISSION_BOTTOM_NAV_ITEMS: StickySectionNavItem[] = [
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

export function BottomNav({
  heroContainerId,
  items,
  highlightColor = '#6335fb',
}: {
  heroContainerId: string
  items: StickySectionNavItem[]
  highlightColor?: string
}) {
  return (
    <div className="fixed bottom-4 left-1/2 z-[9999] block w-[min(26rem,calc(100vw-1.25rem))] -translate-x-1/2 pointer-events-auto">
      <StickySectionNav
        heroContainerId={heroContainerId}
        items={items}
        highlightColor={highlightColor}
      />
    </div>
  )
}
