'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type SeatFinderGuest = {
  id: string
  full_name: string
  photo_url: string | null
  table_id: string
  seat_number: number
}

type SeatFinderTable = {
  id: string
  name: string
  is_active?: boolean
  is_archived?: boolean
}

type GuestWithTable = SeatFinderGuest & {
  table_name: string
}

const TABLE_LAYOUT_SLOTS = [
  { key: 'gold', x: 38, y: 18, expectedName: 'gold' },
  { key: 'blue', x: 38, y: 35, expectedName: 'blue' },
  { key: 'red', x: 38, y: 52, expectedName: 'red' },
  { key: 'green', x: 38, y: 69, expectedName: 'green' },
] as const

const LANDMARKS = [
  { name: 'Lift Lobby', x: 10, y: 26 },
  { name: 'Reception', x: 10, y: 73 },
  { name: 'Kitchen', x: 19, y: 90 },
  { name: 'Activity Area / Main Screen', x: 83, y: 34 },
  { name: 'Bar', x: 70, y: 80 },
] as const

/** Fixed seats per table for stable marker positions (1–30); does not change seat math. */
const SEAT_LAYOUT_CAPACITY = 30

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  const out = `${a}${b}`.toUpperCase()
  return out || 'G'
}

function seatPosition(
  seatNumber: number,
  maxSeatOnTable: number
): { leftPct: number; isTop: boolean } {
  const perSide = Math.max(1, Math.ceil(maxSeatOnTable / 2))
  const sideIndex = Math.max(1, Math.ceil(seatNumber / 2))
  const leftPct = (sideIndex / (perSide + 1)) * 100
  const isTop = seatNumber % 2 === 1
  return { leftPct, isTop }
}

export default function SeatFinderPage() {
  const [rows, setRows] = useState<GuestWithTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  /** After picking a result, hide dropdown until the user edits the search again. */
  const [searchResultsDismissed, setSearchResultsDismissed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const seatRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    async function load() {
      setError(null)
      setLoading(true)
      try {
        const [attendeesRes, tablesRes] = await Promise.all([
          supabase
            .from('attendees')
            .select('id, full_name, photo_url, table_id, seat_number')
            .eq('is_archived', false)
            .not('table_id', 'is', null)
            .not('seat_number', 'is', null),
          supabase
            .from('tables')
            .select('id, name, is_active, is_archived')
            .order('name'),
        ])

        if (attendeesRes.error) throw attendeesRes.error
        if (tablesRes.error) throw tablesRes.error

        const tables = (tablesRes.data ?? []) as SeatFinderTable[]
        const tableNameById = new Map(tables.map((t) => [t.id, t.name]))

        const seatedRows = (attendeesRes.data ?? []) as Array<
          SeatFinderGuest & { table_id: string | null; seat_number: number | null }
        >

        const normalized: GuestWithTable[] = seatedRows
          .filter((r) => r.table_id != null && r.seat_number != null)
          .map((r) => ({
            id: r.id,
            full_name: r.full_name,
            photo_url: r.photo_url ?? null,
            table_id: r.table_id as string,
            seat_number: Number(r.seat_number),
            table_name: tableNameById.get(r.table_id as string) ?? 'Table',
          }))
          .sort((a, b) =>
            a.full_name.localeCompare(b.full_name, undefined, {
              sensitivity: 'base',
            })
          )

        setRows(normalized)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load seats.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const tablesUsed = useMemo(() => {
    const m = new Map<string, { id: string; name: string; guests: GuestWithTable[] }>()
    for (const r of rows) {
      if (!m.has(r.table_id)) {
        m.set(r.table_id, { id: r.table_id, name: r.table_name, guests: [] })
      }
      m.get(r.table_id)!.guests.push(r)
    }
    for (const t of m.values()) {
      t.guests.sort((a, b) => a.seat_number - b.seat_number)
    }
    return [...m.values()]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .slice(0, 4)
  }, [rows])

  const tableBySlot = useMemo(() => {
    const byName = new Map(
      tablesUsed.map((t) => [t.name.trim().toLowerCase(), t] as const)
    )
    const usedIds = new Set<string>()
    const picked: Array<(typeof tablesUsed)[number] | null> = []

    for (const slot of TABLE_LAYOUT_SLOTS) {
      const exact = byName.get(`${slot.expectedName} table`)
      const partial =
        exact ??
        tablesUsed.find((t) =>
          t.name.trim().toLowerCase().includes(slot.expectedName)
        ) ??
        null

      if (partial && !usedIds.has(partial.id)) {
        picked.push(partial)
        usedIds.add(partial.id)
      } else {
        picked.push(null)
      }
    }

    const remaining = tablesUsed.filter((t) => !usedIds.has(t.id))
    return picked.map((p) => p ?? remaining.shift() ?? null)
  }, [tablesUsed])

  const selectedGuest = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  )

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return rows
      .filter((r) => r.full_name.toLowerCase().includes(q))
      .slice(0, 12)
  }, [rows, search])

  function selectGuest(g: GuestWithTable) {
    setSelectedId(g.id)
    setSearch(g.full_name)
    setSearchResultsDismissed(true)
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!selectedGuest) return
    const viewport = viewportRef.current
    const seatEl = seatRefs.current[selectedGuest.id]
    const tableEl = tableRefs.current[selectedGuest.table_id]
    const target = seatEl ?? tableEl
    if (!viewport || !target) return

    const vRect = viewport.getBoundingClientRect()
    const tRect = target.getBoundingClientRect()
    const scrollLeft =
      viewport.scrollLeft +
      (tRect.left - vRect.left) -
      viewport.clientWidth / 2 +
      tRect.width / 2
    const scrollTop =
      viewport.scrollTop +
      (tRect.top - vRect.top) -
      viewport.clientHeight / 2 +
      tRect.height / 2

    viewport.scrollTo({
      left: Math.max(0, scrollLeft),
      top: Math.max(0, scrollTop),
      behavior: 'smooth',
    })
  }, [selectedGuest])

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 px-3 py-5 md:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="relative z-30 rounded-2xl border border-white/10 bg-zinc-900/60 p-4 backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
            Seat Finder
          </p>
          <h1 className="mt-1 text-xl font-semibold text-white">Find your seat</h1>
          <p className="mt-1 text-xs text-zinc-300">
            Search your name, then follow the highlighted seat.
          </p>

          <div className="relative mt-3">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSearchResultsDismissed(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matching.length > 0) {
                  e.preventDefault()
                  selectGuest(matching[0]!)
                }
              }}
              placeholder="Search your name"
              className="relative z-10 w-full rounded-full border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-400 outline-none focus:border-emerald-400/70"
            />
            {search.trim().length > 0 && !searchResultsDismissed ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-xl border border-white/15 bg-zinc-950/95 shadow-xl backdrop-blur-md">
                {loading ? (
                  <p className="px-3 py-2.5 text-xs text-zinc-400">Loading seats…</p>
                ) : matching.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-zinc-400">No results found.</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {matching.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => selectGuest(g)}
                          className={`flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/10 active:bg-white/15 ${
                            selectedId === g.id ? 'bg-emerald-500/15' : ''
                          }`}
                        >
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10">
                            {g.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={g.photo_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-200">
                                {getInitials(g.full_name)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{g.full_name}</p>
                            <p className="text-[11px] text-zinc-400">
                              {g.table_name} · Seat {g.seat_number}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </header>

        {error ? (
          <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        ) : null}

        <section
          ref={viewportRef}
          className="relative z-0 max-h-[min(72vh,640px)] min-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-zinc-900/50 p-0"
        >
          <div className="sticky top-2 z-40 flex justify-end px-2 pt-2">
            <div className="pointer-events-auto flex gap-1 rounded-full border border-white/15 bg-zinc-950/90 p-0.5 shadow-lg backdrop-blur">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.75, z - 0.1))}
                className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-white/10"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-white/10"
              >
                +
              </button>
            </div>
          </div>
          <div
            className="relative mx-auto h-[620px] min-w-[720px] rounded-none border-0 bg-zinc-950/60 transition-transform"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          >
            {LANDMARKS.map((lm) => (
              <div
                key={lm.name}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-300"
                style={{ left: `${lm.x}%`, top: `${lm.y}%` }}
              >
                {lm.name}
              </div>
            ))}
            {TABLE_LAYOUT_SLOTS.map((slot, idx) => {
              const table = tableBySlot[idx] ?? null
              const label =
                table?.name ??
                `${slot.expectedName.charAt(0).toUpperCase()}${slot.expectedName.slice(1)} Table`

              const isSelectedTable =
                Boolean(table && selectedGuest?.table_id === table.id)

              return (
                <div
                  key={slot.key}
                  ref={(el) => {
                    if (table) tableRefs.current[table.id] = el
                  }}
                  className="absolute w-[min(52vw,440px)] max-w-[92%] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                >
                  <div
                    className={`relative h-[76px] overflow-visible rounded-md border transition ${
                      isSelectedTable
                        ? 'border-emerald-400/55 bg-emerald-500/[0.12]'
                        : 'border-white/20 bg-zinc-800/40'
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
                      <span
                        className={`max-w-full truncate text-center text-[11px] font-semibold tracking-wide ${
                          isSelectedTable ? 'text-emerald-100' : 'text-zinc-100/90'
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    <div className="relative h-full w-full">
                      {table
                        ? table.guests.map((g) => {
                            const pos = seatPosition(
                              g.seat_number,
                              SEAT_LAYOUT_CAPACITY
                            )
                            const isSelectedSeat = selectedGuest?.id === g.id
                            return (
                              <button
                                key={g.id}
                                type="button"
                                ref={(el) => {
                                  seatRefs.current[g.id] = el
                                }}
                                onClick={() => selectGuest(g)}
                                className={`absolute z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border text-[8px] font-bold leading-none transition ${
                                  pos.isTop
                                    ? 'top-0 -translate-y-1/2'
                                    : 'bottom-0 translate-y-1/2'
                                } ${
                                  isSelectedSeat
                                    ? 'border-emerald-100 bg-emerald-300 text-zinc-900 shadow-[0_0_14px_rgba(52,211,153,0.9)] animate-pulse ring-2 ring-emerald-200/70'
                                    : 'border-white/12 bg-zinc-900/85 text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                                }`}
                                style={{
                                  left: `${pos.leftPct}%`,
                                }}
                                title={`${g.full_name} · Seat ${g.seat_number}`}
                              >
                                {g.seat_number}
                              </button>
                            )
                          })
                        : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {selectedGuest ? (
          <aside className="sticky bottom-3 z-10 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 shadow-md backdrop-blur">
            <div className="flex items-center gap-3 text-xs text-emerald-100">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-emerald-400/30 bg-white/10">
                {selectedGuest.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedGuest.photo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-emerald-50">
                    {getInitials(selectedGuest.full_name)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{selectedGuest.full_name}</p>
                <p className="mt-0.5 text-[11px] text-emerald-200/85">
                  <span className="font-medium">{selectedGuest.table_name}</span>
                  <span className="mx-1.5 text-emerald-300/60">·</span>
                  <span>Seat {selectedGuest.seat_number}</span>
                </p>
              </div>
            </div>
          </aside>
        ) : null}

        <div className="pb-2">
          <Link
            href="/play"
            className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200"
          >
            ← Back to lobby
          </Link>
        </div>
      </div>
    </main>
  )
}
