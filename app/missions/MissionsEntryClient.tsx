'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DynamicThemeColor } from '@/components/DynamicThemeColor'
import { supabase } from '@/lib/supabase/client'
import { getMissionsEnabled } from '@/lib/app-settings'
import { canonicalTablesForLobby, resolveTeamId } from '@/lib/table-teams'
import { teamPageAdminFormDefaults } from '@/lib/team-page-config'

type GuestTable = {
  id: string
  name: string
  color: string | null
  is_active: boolean
  team_id?: string | null
  display_order?: number
  page_config?: unknown
}

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export default function MissionsEntryClient() {
  const [missionsEnabled, setMissionsEnabled] = useState<boolean | null>(null)
  const [tables, setTables] = useState<GuestTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const enabled = await getMissionsEnabled()
        if (cancelled) return
        setMissionsEnabled(enabled)

        const [{ data, error: tErr }, teamsRes] = await Promise.all([
          supabase
            .from('tables')
            .select('id,name,color,is_active,team_id,display_order,page_config')
            .eq('is_archived', false)
            .order('name'),
          supabase.from('teams').select('id,name'),
        ])

        if (tErr) throw tErr
        if (teamsRes.error) throw teamsRes.error
        const teamNameById = new Map<string, string>()
        for (const row of teamsRes.data ?? []) {
          teamNameById.set(row.id as string, (row.name as string) ?? '')
        }
        const rows = (data ?? []) as GuestTable[]
        const activeRows = rows
          .filter((t) => (t.is_active ?? true) === true)
          .filter((t) => isUuid(t.id))
        setTables(
          canonicalTablesForLobby(activeRows).map((t) => ({
            ...t,
            name: teamNameById.get(resolveTeamId(t))?.trim() ?? '',
          }))
        )
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load tables.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const reloadMissionTables = useCallback(async () => {
    try {
      const [{ data, error: tErr }, teamsRes] = await Promise.all([
        supabase
          .from('tables')
          .select('id,name,color,is_active,team_id,display_order,page_config')
          .eq('is_archived', false)
          .order('name'),
        supabase.from('teams').select('id,name'),
      ])
      if (tErr) throw tErr
      if (teamsRes.error) throw teamsRes.error
      const teamNameById = new Map<string, string>()
      for (const row of teamsRes.data ?? []) {
        teamNameById.set(row.id as string, (row.name as string) ?? '')
      }
      const rows = (data ?? []) as GuestTable[]
      const activeRows = rows
        .filter((t) => (t.is_active ?? true) === true)
        .filter((t) => isUuid(t.id))
      setTables(
        canonicalTablesForLobby(activeRows).map((t) => ({
          ...t,
          name: teamNameById.get(resolveTeamId(t))?.trim() ?? '',
        }))
      )
    } catch {
      /* keep previous list */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    let resubscribeTimer: number | null = null

    const attachRealtimeChannel = () => {
      if (cancelled) return
      channel = supabase
        .channel('missions-entry-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
          void reloadMissionTables()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
          void reloadMissionTables()
        })
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
  }, [reloadMissionTables])

  const content = useMemo(() => {
    if (loading || missionsEnabled === null) return null
    if (missionsEnabled !== true) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
          <div className="text-sm font-semibold text-amber-900">Opening soon</div>
          <div className="mt-1 text-xs text-amber-900/80">
            Missions are paused until the event starts.
          </div>
          <div className="mt-3">
            <Link
              href="/"
              className="text-xs font-medium text-amber-900 underline hover:no-underline"
            >
              Back to hub
            </Link>
          </div>
        </div>
      )
    }

    if (!tables.length) {
      return (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center">
          <div className="text-sm font-semibold text-zinc-900">No tables yet</div>
          <div className="mt-1 text-xs text-zinc-600">Please check back soon.</div>
        </div>
      )
    }

    return (
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
        {tables.map((t) => {
          if (!isUuid(t.id)) return null
          const resolved = teamPageAdminFormDefaults(t.page_config, {
            tableColor: t.color,
            tableName: t.name,
          })
          const art =
            resolved.heroImageUrl.trim() || resolved.avatarImageUrl.trim() || null
          return (
            <Link
              key={t.id}
              href={`/missions/${t.id}`}
              className="group relative h-[220px] overflow-hidden rounded-2xl border border-zinc-200 text-left outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-zinc-400/70 focus-visible:ring-offset-2 sm:h-[250px]"
              style={{
                background: `linear-gradient(to bottom, ${resolved.heroTop}, ${resolved.heroMiddle || resolved.heroBottom}, ${resolved.heroBottom})`,
              }}
            >
              <div className="relative flex h-full flex-col p-3 text-white">
                <p className="relative z-[1] text-center text-sm font-bold leading-tight sm:text-base">
                  {t.name}
                </p>
                {art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={art}
                    alt=""
                    className="relative z-[1] mx-auto mt-2 h-28 w-full max-w-full flex-1 object-contain opacity-95 sm:h-32"
                  />
                ) : null}
              </div>
            </Link>
          )
        })}
      </div>
    )
  }, [loading, missionsEnabled, tables])

  return (
    <main className="guest-page-shell bg-white px-4 py-8">
      <DynamicThemeColor color="#ffffff" />
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-black">
          Choose your table
        </h1>

        {content}

        {loading && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[220px] animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 sm:h-[250px]"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <div className="text-sm font-semibold text-red-800">Error</div>
            <div className="mt-1 text-xs text-red-800/90">{error}</div>
          </div>
        )}
      </div>
    </main>
  )
}
