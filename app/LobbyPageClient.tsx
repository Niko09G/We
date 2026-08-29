'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DynamicThemeColor } from '@/components/DynamicThemeColor'
import { LobbyEventProgramSection } from '@/components/guest/LobbyEventProgramSection'
import { LobbyHero } from '@/components/guest/LobbyHero'
import { LobbyMcsSection } from '@/components/guest/LobbyMcsSection'
import { LobbyTeamsSection, type LobbyTeamRow } from '@/components/guest/LobbyTeamsSection'
import { BottomNav, LOBBY_BOTTOM_NAV_ITEMS } from '@/components/BottomNav'
import { SeatingMapPanel } from '@/components/guest/SeatingMapPanel'
import {
  fetchLobbySettings,
  LOBBY_SETTINGS_KEY,
  type LobbyModuleId,
  type LobbySettings,
} from '@/lib/lobby-settings'
import { MISSIONS_HERO_THEME_COLOR } from '@/lib/guest-missions-gradients'
import { supabase } from '@/lib/supabase/client'
import { lobbyRowsFromParentTeams } from '@/lib/table-teams'

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

export function LobbyPageClient() {
  const [settings, setSettings] = useState<LobbySettings | null>(null)
  const [tables, setTables] = useState<LobbyTeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLobbyData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [lobby, tablesRes, teamsRes] = await Promise.all([
        fetchLobbySettings(),
        supabase
          .from('tables')
          .select('id,name,color,page_config,is_active,display_order,team_id')
          .eq('is_archived', false)
          .eq('is_active', true)
          .order('display_order')
          .order('name'),
        supabase
          .from('teams')
          .select('id,name,color,sort_order,is_active')
          .eq('is_active', true)
          .order('sort_order')
          .order('name'),
      ])

      if (tablesRes.error) throw tablesRes.error
      if (teamsRes.error) throw teamsRes.error

      setSettings(lobby)
      const physical = ((tablesRes.data ?? []) as (LobbyTeamRow & {
        is_active?: boolean
        display_order?: number
        team_id?: string | null
      })[]).filter((t) => isUuid(t.id))
      const parentTeams = (teamsRes.data ?? []) as Array<{
        id: string
        name: string
        color?: string | null
        sort_order?: number
      }>
      setTables(lobbyRowsFromParentTeams(parentTeams, physical))
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : 'Failed to load lobby.')
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLobbyData()
  }, [loadLobbyData])

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    let resubscribeTimer: number | null = null

    const attachRealtimeChannel = () => {
      if (cancelled) return
      channel = supabase
        .channel('lobby-guest-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
          void loadLobbyData({ silent: true })
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
          void loadLobbyData({ silent: true })
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_settings' },
          (payload) => {
            const key =
              typeof (payload.new as { key?: unknown } | null)?.key === 'string'
                ? (payload.new as { key: string }).key
                : null
            if (key === LOBBY_SETTINGS_KEY) void loadLobbyData({ silent: true })
          }
        )
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (channel) {
              supabase.removeChannel(channel)
              channel = null
            }
            resubscribeTimer = window.setTimeout(attachRealtimeChannel, 2_000)
          }
        })
    }

    attachRealtimeChannel()

    return () => {
      cancelled = true
      if (resubscribeTimer) window.clearTimeout(resubscribeTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [loadLobbyData])

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
    <main className="guest-page-shell min-w-0 max-w-full overflow-x-hidden bg-white pb-px">
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
          carouselImages={settings?.carousel_images}
          onFindSeat={() => scrollToSection('seat-finder')}
          onSeeProgram={() => scrollToSection('program')}
        />
      </div>

      <div className="relative z-10 -mt-12 min-h-dvh rounded-t-3xl bg-white pb-28 shadow-2xl isolate">
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

      <BottomNav heroContainerId="section-hero" items={LOBBY_BOTTOM_NAV_ITEMS} />
    </main>
  )
}
