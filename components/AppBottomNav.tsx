'use client'

import { usePathname } from 'next/navigation'
import {
  BottomNav,
  LOBBY_BOTTOM_NAV_ITEMS,
  MISSION_BOTTOM_NAV_ITEMS,
} from '@/components/BottomNav'

export function AppBottomNav() {
  const pathname = usePathname()

  if (pathname === '/') {
    return <BottomNav heroContainerId="section-hero" items={LOBBY_BOTTOM_NAV_ITEMS} />
  }

  if (/^\/missions\/[^/]+$/.test(pathname)) {
    return <BottomNav heroContainerId="section-hero" items={MISSION_BOTTOM_NAV_ITEMS} />
  }

  return null
}
