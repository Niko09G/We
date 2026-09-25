export type BottomNavItem = {
  id: string
  label: string
  href: string
  activeIconSrc: string
  inactiveIconSrc: string
  iconAlt: string
}

export const LOBBY_BOTTOM_NAV_ITEMS: BottomNavItem[] = []

export function getMissionBottomNavItems(_tableId: string): BottomNavItem[] {
  return []
}

export function BottomNav() {
  return null
}
