'use client'

import { usePathname } from 'next/navigation'
import {
  BottomNav,
  getMissionBottomNavItems,
  LOBBY_BOTTOM_NAV_ITEMS,
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

  const missionMatch = pathname.match(/^\/missions\/([^/]+)$/)
  if (missionMatch) {
    return <BottomNav items={getMissionBottomNavItems(missionMatch[1])} />
  }

  return null
}
