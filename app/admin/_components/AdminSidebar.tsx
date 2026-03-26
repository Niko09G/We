'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { supabase } from '@/lib/supabase/client'

type NavItem = {
  href: string
  label: string
  section: 'event' | 'scoring' | 'system'
  icon: (props: { active: boolean }) => JSX.Element
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

function NavIcon({
  active,
  d,
}: {
  active: boolean
  d: JSX.Element
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 ${active ? 'opacity-100' : 'opacity-80'}`}
      aria-hidden
    >
      {d}
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin',
    label: 'Overview',
    key: 'overview',
    section: 'event',
    icon: ({ active }) => <NavIcon active={active} d={<path d="M3 12h18M12 3v18" />} />,
  },
  {
    href: '/admin/missions',
    label: 'Missions',
    key: 'missions',
    section: 'event',
    icon: ({ active }) => (
      <NavIcon active={active} d={<><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></>} />
    ),
  },
  {
    href: '/admin/tables',
    label: 'Tables',
    key: 'tables',
    section: 'event',
    icon: ({ active }) => <NavIcon active={active} d={<><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16M10 6v12" /></>} />,
  },
  {
    href: '/admin/seating',
    label: 'Seating',
    key: 'seating',
    section: 'event',
    icon: ({ active }) => <NavIcon active={active} d={<><path d="M5 19v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5" /><path d="M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></>} />,
  },
  {
    href: '/admin/attendees',
    label: 'Attendees',
    key: 'attendees',
    section: 'event',
    icon: ({ active }) => <NavIcon active={active} d={<><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></>} />,
  },
  {
    href: '/admin/submissions',
    label: 'Submissions',
    key: 'submissions',
    section: 'event',
    icon: ({ active }) => <NavIcon active={active} d={<><path d="M7 12l3 3 7-7" /><rect x="3" y="4" width="18" height="16" rx="2" /></>} />,
  },
  {
    href: '/admin/greetings',
    label: 'Greetings',
    key: 'greetings',
    section: 'event',
    icon: ({ active }) => <NavIcon active={active} d={<><path d="M4 7h16v10H4z" /><path d="m4 8 8 6 8-6" /></>} />,
  },
  {
    href: '/admin/tokens',
    label: 'Tokens',
    key: 'tokens',
    section: 'scoring',
    icon: ({ active }) => <NavIcon active={active} d={<><circle cx="12" cy="12" r="8" /><path d="M8 12h8" /></>} />,
  },
  {
    href: '/admin/scoreboard',
    label: 'Score breakdown',
    key: 'scoreboard',
    section: 'scoring',
    icon: ({ active }) => <NavIcon active={active} d={<><path d="M5 18V8M12 18V5M19 18v-9" /></>} />,
  },
  {
    href: '/admin/display',
    label: 'Display Controls',
    key: 'display',
    section: 'scoring',
    icon: ({ active }) => <NavIcon active={active} d={<><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8" /></>} />,
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    key: 'settings',
    section: 'system',
    icon: ({ active }) => <NavIcon active={active} d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.25.34.47.72.6 1 .12.31.2.64.2 1s-.08.69-.2 1c-.13.28-.35.66-.6 1Z" /></>} />,
  },
  {
    href: '/admin/recovery',
    label: 'Recovery',
    key: 'recovery',
    section: 'system',
    icon: ({ active }) => <NavIcon active={active} d={<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v6h6" /></>} />,
  },
]

export default function AdminSidebar() {
  const grouped = useMemo(
    () => ({
      event: NAV_ITEMS.filter((i) => i.section === 'event'),
      scoring: NAV_ITEMS.filter((i) => i.section === 'scoring'),
      system: NAV_ITEMS.filter((i) => i.section === 'system'),
    }),
    []
  )

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
            <div className="admin-helper-text text-zinc-900 dark:text-zinc-100">
              Admin
            </div>
            <div className="mt-1 admin-helper-text">
              Manage the event
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            {(['event', 'scoring', 'system'] as const).map((sectionKey, idx) => (
              <div key={sectionKey} className={idx === 0 ? '' : 'mt-4 pt-4 border-t border-zinc-200/70 dark:border-zinc-800/70'}>
                <div className="px-3 mb-1 admin-helper-text uppercase tracking-wide">
                  {sectionKey}
                </div>
                <ul className="space-y-1">
                  {grouped[sectionKey].map((item) => {
                    const isActive = activeKey === item.key
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`group flex items-center justify-between rounded-xl px-3 py-2.5 admin-btn-text-small transition-colors ${
                            isActive
                              ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                              : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                          }`}
                        >
                          <span className="inline-flex items-center gap-2.5">
                            {item.icon({ active: isActive })}
                            <span>{item.label}</span>
                          </span>
                          {item.key === 'submissions' && pendingCount !== null && pendingCount > 0 && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 admin-helper-text text-amber-700 dark:text-amber-200 border border-amber-500/25">
                              {pendingCount}
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Mobile: top bar + slide-down nav */}
      <div className="md:hidden">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate admin-helper-text text-zinc-900 dark:text-zinc-100">
              Admin
            </div>
            <div className="truncate admin-helper-text">
              {NAV_ITEMS.find((n) => n.key === activeKey)?.label}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 admin-btn-text-small text-zinc-700 dark:text-zinc-200"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </header>

        {mobileOpen && (
          <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <div className="space-y-3 p-2">
              {(['event', 'scoring', 'system'] as const).map((sectionKey) => (
                <div key={sectionKey}>
                  <div className="px-3 mb-1 admin-helper-text uppercase tracking-wide">
                    {sectionKey}
                  </div>
                  <ul className="space-y-1">
                    {grouped[sectionKey].map((item) => {
                      const isActive = activeKey === item.key
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={`group flex items-center justify-between rounded-xl px-3 py-2.5 admin-btn-text-small ${
                              isActive
                                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2.5">
                              {item.icon({ active: isActive })}
                              <span>{item.label}</span>
                            </span>
                            {item.key === 'submissions' &&
                            pendingCount !== null &&
                            pendingCount > 0 ? (
                              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 admin-helper-text text-amber-700 dark:text-amber-200 border border-amber-500/25">
                                {pendingCount}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        )}
      </div>
    </>
  )
}

