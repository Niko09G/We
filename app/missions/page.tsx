'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DynamicThemeColor } from '@/components/DynamicThemeColor'
import { supabase } from '@/lib/supabase/client'
import { getMissionsEnabled } from '@/lib/app-settings'
import { canonicalTablesForLobby, resolveTeamId } from '@/lib/table-teams'

type GuestTable = {
  id: string
  name: string
  color: string | null
  is_active: boolean
  team_id?: string | null
  display_order?: number
}

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.trim().replace(/^#/, '')
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned
  if (full.length !== 6) return `rgba(255,255,255,${alpha})`
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function MissionsEntryPage() {
  const [missionsEnabled, setMissionsEnabled] = useState<boolean | null>(null)
  const [tables, setTables] = useState<GuestTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 240)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
            .select('id,name,color,is_active,team_id,display_order')
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
            name: teamNameById.get(resolveTeamId(t))?.trim() || t.name,
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
          .select('id,name,color,is_active,team_id,display_order')
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
          name: teamNameById.get(resolveTeamId(t))?.trim() || t.name,
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
        <div className="rounded-xl border border-zinc-800 bg-white/5 px-4 py-3 text-center">
          <div className="text-sm font-semibold text-white">No tables yet</div>
          <div className="mt-1 text-xs text-white/70">Please check back soon.</div>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-2 gap-3">
        {tables.map((t) => {
          if (!isUuid(t.id)) return null
          const hasColor = typeof t.color === 'string' && t.color.trim().length > 0
          const accent = hasColor ? t.color!.trim() : '#3f3f46'
          return (
            <Link
              key={t.id}
              href={`/missions/${t.id}`}
              className="block rounded-2xl border border-zinc-800 bg-white/5 p-3"
              style={{
                borderLeftWidth: 6,
                borderLeftColor: accent,
                backgroundColor: hasColor ? hexToRgba(accent, 0.06) : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {t.name}
                  </div>
                  <div className="mt-1 text-[11px] text-white/70">Select table</div>
                </div>
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/10"
                  style={{
                    backgroundColor: hasColor ? accent : '#71717a',
                  }}
                  aria-hidden
                />
              </div>
            </Link>
          )
        })}
      </div>
    )
  }, [loading, missionsEnabled, tables])

  return (
    <main className="guest-page-shell bg-zinc-950 px-4 py-8">
      <DynamicThemeColor color="#09090b" />
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Missions
          </h1>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">
            Pick your table to see what quests are available.
          </p>
        </div>

        {content}

        {loading && (
          <div className="mt-3 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[92px] animate-pulse rounded-2xl border border-zinc-800 bg-white/5"
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

      <div className="mx-auto mt-8 flex w-full max-w-md justify-center px-4 pb-8">
        <button
          type="button"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 active:scale-95 ${
            showBackToTop ? 'opacity-100' : 'opacity-70'
          }`}
        >
          Back to top
        </button>
      </div>
    </main>
  )
}

