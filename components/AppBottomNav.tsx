'use client'

import { usePathname } from 'next/navigation'
import {
  BottomNav,
  LOBBY_BOTTOM_NAV_ITEMS,
  MISSION_BOTTOM_NAV_ITEMS,
} from '@/components/BottomNav'

function showsGuestBottomNav(pathname: string): boolean {
  return pathname === '/' || /^\/missions\/[^/]+$/.test(pathname)
}

export function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div className={showsGuestBottomNav(pathname) ? 'pb-24' : undefined}>{children}</div>
}

export function AppBottomNav() {
  const pathname = usePathname()

  if (pathname === '/') {
    return <BottomNav items={LOBBY_BOTTOM_NAV_ITEMS} />
  }

  if (/^\/missions\/[^/]+$/.test(pathname)) {
    return <BottomNav items={MISSION_BOTTOM_NAV_ITEMS} />
  }

  return null
}
