'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DynamicThemeColor } from '@/components/DynamicThemeColor'
import { LobbyEventProgramSection } from '@/components/guest/LobbyEventProgramSection'
import { LobbyHero } from '@/components/guest/LobbyHero'
import { LobbyMcsSection } from '@/components/guest/LobbyMcsSection'
import { LobbyTeamsSection, type LobbyTeamRow } from '@/components/guest/LobbyTeamsSection'
import { SeatingMapPanel } from '@/components/guest/SeatingMapPanel'
import {
  fetchLobbySettings,
  type LobbyModuleId,
  type LobbySettings,
} from '@/lib/lobby-settings'
import { MISSIONS_HERO_THEME_COLOR } from '@/lib/guest-missions-gradients'
import { supabase } from '@/lib/supabase/client'

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export default function LobbyPage() {
  const [settings, setSettings] = useState<LobbySettings | null>(null)
  const [tables, setTables] = useState<LobbyTeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [lobby, tablesRes] = await Promise.all([
          fetchLobbySettings(),
          supabase
            .from('tables')
            .select('id,name,color,page_config,is_active,display_order')
            .eq('is_archived', false)
            .order('display_order')
            .order('name'),
        ])

        if (tablesRes.error) throw tablesRes.error

        if (cancelled) return

        setSettings(lobby)
        const rows = (tablesRes.data ?? []) as (LobbyTeamRow & {
          is_active?: boolean
          display_order?: number
        })[]
        setTables(
          rows
            .filter((t) => (t.is_active ?? true) === true)
            .filter((t) => isUuid(t.id))
            .slice(0, 4)
        )
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load lobby.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enabledModules = useMemo(() => {
    if (!settings) return []
    return settings.modules_order.filter((id) => settings.modules[id]?.enabled)
  }, [settings])

  const renderModule = useCallback(
    (id: LobbyModuleId) => {
      if (!settings) return null
      const mod = settings.modules[id]
      if (!mod?.enabled) return null

      switch (id) {
        case 'seat-finder':
          return (
            <section
              key={id}
              id="seat-finder"
              className="w-full scroll-mt-8 px-5 pt-8 pb-2"
            >
              <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">
                {mod.title}
              </h2>
              {mod.description?.trim() ? (
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-zinc-600">
                  {mod.description}
                </p>
              ) : null}
              <div className="mt-4">
                <SeatingMapPanel layout="embedded" showSectionHeading={false} />
              </div>
            </section>
          )
        case 'event-program':
          return (
            <LobbyEventProgramSection
              key={id}
              title={mod.title}
              description={mod.description}
              items={settings.event_program}
            />
          )
        case 'mcs':
          return (
            <LobbyMcsSection
              key={id}
              title={mod.title}
              description={mod.description}
              mcs={settings.mcs}
            />
          )
        case 'teams':
          return (
            <LobbyTeamsSection
              key={id}
              title={mod.title}
              description={mod.description}
              tables={tables}
            />
          )
        default:
          return null
      }
    },
    [settings, tables]
  )

  const hero = settings?.hero

  return (
    <main className="min-h-screen w-full min-w-0 max-w-full bg-white">
      <DynamicThemeColor color={MISSIONS_HERO_THEME_COLOR} />
      <div id="section-hero" className="sticky top-0 z-0 h-[100dvh]">
        <LobbyHero
          loading={loading || !hero}
          hero={
            hero ?? {
              title: '',
              description: '',
              cta_find_seat_label: 'Find My Seat',
              cta_program_label: 'See the Program',
            }
          }
          headerLogoUrl={settings?.header_logo_url}
          heroBackgroundUrl={settings?.hero_background_url}
          onFindSeat={() => scrollToSection('seat-finder')}
          onSeeProgram={() => scrollToSection('event-program')}
        />
      </div>

      <div className="relative z-10 -mt-6 min-h-screen rounded-t-3xl bg-white shadow-2xl isolate">
        {error ? (
          <div className="mx-5 mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-800">Could not load lobby</p>
            <p className="mt-1 text-xs text-red-800/90">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-6 px-5 pt-10" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-zinc-100" />
            ))}
          </div>
        ) : (
          enabledModules.map((id) => renderModule(id))
        )}
      </div>
    </main>
  )
}
