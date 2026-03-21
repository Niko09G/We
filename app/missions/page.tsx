'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getMissionsEnabled } from '@/lib/app-settings'

type GuestTable = { id: string; name: string; color: string | null; is_active: boolean }

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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const enabled = await getMissionsEnabled()
        if (cancelled) return
        setMissionsEnabled(enabled)

        const { data, error: tErr } = await supabase
          .from('tables')
          .select('id,name,color,is_active')
          .eq('is_archived', false)
          .order('name')

        if (tErr) throw tErr
        const rows = (data ?? []) as GuestTable[]
        const activeRows = rows
          .filter((t) => (t.is_active ?? true) === true)
          .filter((t) => isUuid((t as any).id))
        setTables(activeRows)
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
              href="/play"
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
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
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
    </main>
  )
}

