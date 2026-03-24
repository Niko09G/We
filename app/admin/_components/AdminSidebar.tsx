'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type NavItem = {
  href: string
  label: string
  key:
    | 'overview'
    | 'missions'
    | 'tokens'
    | 'tables'
    | 'seating'
    | 'attendees'
    | 'submissions'
    | 'greetings'
    | 'display'
    | 'scoreboard'
    | 'settings'
    | 'recovery'
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Overview', key: 'overview' },
  { href: '/admin/missions', label: 'Missions', key: 'missions' },
  { href: '/admin/tokens', label: 'Tokens', key: 'tokens' },
  { href: '/admin/scoreboard', label: 'Score breakdown', key: 'scoreboard' },
  { href: '/admin/tables', label: 'Tables', key: 'tables' },
  { href: '/admin/seating', label: 'Seating', key: 'seating' },
  { href: '/admin/attendees', label: 'Attendees', key: 'attendees' },
  { href: '/admin/submissions', label: 'Submissions', key: 'submissions' },
  { href: '/admin/greetings', label: 'Greetings', key: 'greetings' },
  { href: '/admin/display', label: 'Display Controls', key: 'display' },
  { href: '/admin/settings', label: 'Settings', key: 'settings' },
  { href: '/admin/recovery', label: 'Recovery', key: 'recovery' },
]

function pendingBadgeForPath(pathname: string) {
  return pathname.startsWith('/admin/submissions')
}

export default function AdminSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  const activeKey = useMemo(() => {
    if (pathname === '/admin') return 'overview'
    if (pathname.startsWith('/admin/missions')) return 'missions'
    if (pathname.startsWith('/admin/tokens')) return 'tokens'
    if (pathname.startsWith('/admin/scoreboard')) return 'scoreboard'
    if (pathname.startsWith('/admin/tables')) return 'tables'
    if (pathname.startsWith('/admin/seating')) return 'seating'
    if (pathname.startsWith('/admin/attendees')) return 'attendees'
    if (pathname.startsWith('/admin/submissions')) return 'submissions'
    if (pathname.startsWith('/admin/greetings')) return 'greetings'
    if (pathname.startsWith('/admin/settings')) return 'settings'
    if (pathname.startsWith('/admin/recovery')) return 'recovery'
    return 'display'
  }, [pathname])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { count, error } = await supabase
          .from('mission_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')

        if (cancelled) return
        if (error) throw error
        setPendingCount(typeof count === 'number' ? count : 0)
      } catch {
        if (!cancelled) setPendingCount(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="hidden md:block fixed left-0 top-0 h-screen w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur">
        <div className="flex h-full flex-col">
          <div className="px-4 py-4">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Admin
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Manage the event
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeKey === item.key
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
                        isActive
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.key === 'submissions' && pendingCount !== null && pendingCount > 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-200 border border-amber-500/25">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </aside>

      {/* Mobile: top bar + slide-down nav */}
      <div className="md:hidden">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Admin
            </div>
            <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {NAV_ITEMS.find((n) => n.key === activeKey)?.label}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </header>

        {mobileOpen && (
          <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <ul className="space-y-1 p-2">
              {NAV_ITEMS.map((item) => {
                const isActive = activeKey === item.key
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
                        isActive
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.key === 'submissions' && pendingCount !== null && pendingCount > 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-200 border border-amber-500/25">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        )}
      </div>
    </>
  )
}

