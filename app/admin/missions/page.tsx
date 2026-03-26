'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminValidationTypeLabel,
  listMissions,
  type MissionRecord,
  type ValidationType,
} from '@/lib/admin-missions'
import { listActiveMissionAssignmentsForAdmin } from '@/lib/admin-mission-assignments'
import { MISSION_CARD_THEME_LABELS } from '@/lib/guest-missions-gradients'
import { missionTypeIcon, themeLabel } from '@/app/admin/missions/_components/mission-admin-shared'

type StateFilter = 'all' | 'live' | 'draft'
type TypeFilter = 'all' | string
type ThemeFilter = 'all' | 'auto' | number

export default function MissionsLibraryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missions, setMissions] = useState<MissionRecord[]>([])
  const [assignmentsByMission, setAssignmentsByMission] = useState<Record<string, string[]>>({})
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>('all')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mList, aMap] = await Promise.all([
        listMissions(),
        listActiveMissionAssignmentsForAdmin(),
      ])
      setMissions(mList)
      setAssignmentsByMission(aMap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load missions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return missions.filter((m) => {
      if (stateFilter === 'live' && !m.is_active) return false
      if (stateFilter === 'draft' && m.is_active) return false
      if (typeFilter !== 'all' && m.validation_type !== typeFilter) return false
      if (themeFilter === 'auto' && m.card_theme_index != null) return false
      if (typeof themeFilter === 'number' && m.card_theme_index !== themeFilter) return false
      if (q) {
        const hay = `${m.title} ${m.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [missions, search, stateFilter, typeFilter, themeFilter])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-zinc-950 md:px-6">
        <p className="text-sm text-zinc-500">Loading missions…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 dark:bg-zinc-950 md:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
              <h1 className="admin-page-title text-zinc-900 dark:text-zinc-100">Missions</h1>
              <p className="admin-gap-page-title-intro admin-intro">
              Catalog of mission templates. Open the builder to edit details, or jump to the board to
              assign tables.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
              <Link
                href="/admin/missions/board"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Assignment board
              </Link>
              <Link
                href="/admin"
                className="rounded-lg border border-transparent px-3 py-1.5 text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
              >
                Admin home
              </Link>
            </div>
          </div>
          <Link
            href="/admin/missions/new"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Create mission
          </Link>
        </header>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="block min-w-0 flex-1 text-xs">
              <span className="font-medium text-zinc-500">Search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title or description…"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-xs lg:w-36">
              <span className="font-medium text-zinc-500">State</span>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as StateFilter)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="all">All</option>
                <option value="live">Live</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label className="block text-xs lg:w-44">
              <span className="font-medium text-zinc-500">Type</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="all">All types</option>
                <option value="photo">Photo</option>
                <option value="video">Video</option>
                <option value="signature">Signature</option>
                <option value="text">Text</option>
                <option value="beatcoin">BeatCoin</option>
              </select>
            </label>
            <label className="block text-xs lg:w-44">
              <span className="font-medium text-zinc-500">Theme</span>
              <select
                value={
                  themeFilter === 'all'
                    ? 'all'
                    : themeFilter === 'auto'
                      ? 'auto'
                      : String(themeFilter)
                }
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'all') setThemeFilter('all')
                  else if (v === 'auto') setThemeFilter('auto')
                  else setThemeFilter(Number(v))
                }}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="all">All themes</option>
                <option value="auto">Auto palette</option>
                {MISSION_CARD_THEME_LABELS.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ul className="mt-5 divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.length === 0 ? (
              <li className="py-10 text-center text-sm text-zinc-500">No missions match.</li>
            ) : (
              filtered.map((m) => (
                <MissionLibraryRow
                  key={m.id}
                  mission={m}
                  assignedCount={(assignmentsByMission[m.id] ?? []).length}
                />
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}

function MissionLibraryRow({
  mission: m,
  assignedCount,
}: {
  mission: MissionRecord
  assignedCount: number
}) {
  return (
      <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base" aria-hidden>
              {missionTypeIcon(m.validation_type)}
            </span>
            <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{m.title}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                m.is_active
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {m.is_active ? 'Live' : 'Draft'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{adminValidationTypeLabel(m.validation_type as ValidationType)}</span>
            <span>Reward · {m.points} pts</span>
            <span>Theme · {themeLabel(m.card_theme_index)}</span>
            <span>
              Tables · {assignedCount} assigned
            </span>
          </div>
        </div>
        <Link
          href={`/admin/missions/${m.id}/edit`}
          className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-center text-sm font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100"
        >
          Edit
        </Link>
      </li>
  )
}
