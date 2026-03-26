'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  MISSION_CARD_BACKGROUNDS,
  firstStopColorFromMissionGradient,
} from '@/lib/guest-missions-gradients'

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
  color: string | null
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
  { name: 'Activity / screen', x: 83, y: 34 },
  { name: 'Bar', x: 70, y: 80 },
] as const

const SEAT_LAYOUT_CAPACITY = 30
const WORLD_W = 720
const WORLD_H = 620

const DEFAULT_ZOOM = 0.86
const FOCUS_ZOOM = 1.06
const ZOOM_MIN = 0.72
const ZOOM_MAX = 1.22
const TRANSFORM_MS = 280

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

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, '')
  if (!raw) return null
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.length === 6
        ? raw
        : null
  if (!full) return null
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbAlpha(hex: string, a: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(139, 92, 246, ${a})`
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`
}

function softTableBackground(hex: string | null, slotIndex: number): {
  background: string
  borderColor: string
  shadow: string
} {
  const base =
    hex?.trim() ||
    firstStopColorFromMissionGradient(
      MISSION_CARD_BACKGROUNDS[slotIndex % MISSION_CARD_BACKGROUNDS.length]!
    )
  return {
    background: `linear-gradient(165deg, ${rgbAlpha(base, 0.38)} 0%, ${rgbAlpha(base, 0.14)} 48%, rgba(255,255,255,0.96) 100%)`,
    borderColor: rgbAlpha(base, 0.28),
    shadow: `0 4px 14px ${rgbAlpha(base, 0.12)}`,
  }
}

type DragRef = { sx: number; sy: number; px: number; py: number }

export function SeatingMapPanel({
  className = '',
  layout = 'page',
  showSectionHeading = true,
}: {
  className?: string
  layout?: 'page' | 'embedded'
  /** When false, parent renders the h2 (e.g. missions page). */
  showSectionHeading?: boolean
}) {
  const [rows, setRows] = useState<GuestWithTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResultsDismissed, setSearchResultsDismissed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [transitionTransform, setTransitionTransform] = useState(false)
  const [pressedTableId, setPressedTableId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [tableColors, setTableColors] = useState<Record<string, string | null>>({})

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const seatRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const dragRef = useRef<DragRef | null>(null)

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
            .select('id, name, is_active, is_archived, color')
            .order('name'),
        ])

        if (attendeesRes.error) throw attendeesRes.error
        if (tablesRes.error) throw tablesRes.error

        const tables = (tablesRes.data ?? []) as SeatFinderTable[]
        const tableNameById = new Map(tables.map((t) => [t.id, t.name]))
        const colorMap: Record<string, string | null> = {}
        for (const t of tables) {
          colorMap[t.id] = t.color ?? null
        }
        setTableColors(colorMap)

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

  const centerPanForWorldPoint = useCallback((wx: number, wy: number, nextZoom: number) => {
    const vp = viewportRef.current
    if (!vp) return { x: 0, y: 0 }
    const Vcx = vp.clientWidth / 2
    const Vcy = vp.clientHeight / 2
    return {
      x: Vcx - wx * nextZoom,
      y: Vcy - wy * nextZoom,
    }
  }, [])

  const applyDefaultCenter = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const z = DEFAULT_ZOOM
    const wx = WORLD_W / 2
    const wy = WORLD_H / 2
    const Vcx = vp.clientWidth / 2
    const Vcy = vp.clientHeight / 2
    setZoom(z)
    setPan({ x: Vcx - wx * z, y: Vcy - wy * z })
  }, [])

  useLayoutEffect(() => {
    if (loading) return
    requestAnimationFrame(() => applyDefaultCenter())
  }, [applyDefaultCenter, loading])

  const selectGuest = (g: GuestWithTable) => {
    setSelectedId(g.id)
    setSearch(g.full_name)
    setSearchResultsDismissed(true)
  }

  useEffect(() => {
    if (layout === 'page') {
      inputRef.current?.focus()
    }
  }, [layout])

  useEffect(() => {
    if (!selectedGuest) return
    const idx = tableBySlot.findIndex((t) => t?.id === selectedGuest.table_id)
    if (idx < 0) return
    const slot = TABLE_LAYOUT_SLOTS[idx]!
    const wx = (slot.x / 100) * WORLD_W
    const wy = (slot.y / 100) * WORLD_H

    setTransitionTransform(true)
    const z = FOCUS_ZOOM
    setZoom(z)
    setPan(centerPanForWorldPoint(wx, wy, z))
    const t = window.setTimeout(() => setTransitionTransform(false), TRANSFORM_MS + 40)
    return () => window.clearTimeout(t)
  }, [selectedGuest, tableBySlot, centerPanForWorldPoint])

  const setZoomAnchored = (next: number) => {
    const el = viewportRef.current
    if (!el) return
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    const Vcx = el.clientWidth / 2
    const Vcy = el.clientHeight / 2
    const worldX = (Vcx - pan.x) / zoom
    const worldY = (Vcy - pan.y) / zoom
    setZoom(z)
    setPan({ x: Vcx - worldX * z, y: Vcy - worldY * z })
  }

  const handleResetView = () => {
    setTransitionTransform(true)
    applyDefaultCenter()
    window.setTimeout(() => setTransitionTransform(false), TRANSFORM_MS + 40)
  }

  const onPointerDownViewport = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button')) return
    setDragging(true)
    setTransitionTransform(false)
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      px: pan.x,
      py: pan.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMoveViewport = (e: React.PointerEvent) => {
    if (!dragging || !dragRef.current) return
    const d = dragRef.current
    setPan({
      x: d.px + (e.clientX - d.sx),
      y: d.py + (e.clientY - d.sy),
    })
  }

  const endDrag = (e: React.PointerEvent) => {
    if (dragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    setDragging(false)
    dragRef.current = null
  }

  const shellClass =
    layout === 'page'
      ? 'flex h-[70vh] max-h-[70vh] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.07)]'
      : 'flex h-[min(65vh,560px)] max-h-[70vh] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.07)]'

  const titleBlock = showSectionHeading ? (
    <div className="shrink-0 px-5 pt-5">
      <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">
        Find your seat
      </h2>
      <p className="mt-1 text-left text-sm text-zinc-500">
        Search your name or explore the tables
      </p>
    </div>
  ) : null

  const searchBlock = (
    <div className={`relative shrink-0 px-5 ${showSectionHeading ? 'pt-4' : 'pt-5'}`}>
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
        className="relative z-10 w-full rounded-full border border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors duration-200 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-200/60"
      />
      {search.trim().length > 0 && !searchResultsDismissed ? (
        <div className="absolute left-5 right-5 top-full z-50 mt-1 max-h-52 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          {loading ? (
            <p className="px-3 py-2.5 text-xs text-zinc-500">Loading seats…</p>
          ) : matching.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-zinc-500">No results found.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {matching.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => selectGuest(g)}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-200 hover:bg-zinc-50 active:bg-zinc-100/80 ${
                      selectedId === g.id ? 'bg-violet-50' : ''
                    }`}
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
                      {g.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-600">
                          {getInitials(g.full_name)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">{g.full_name}</p>
                      <p className="text-[11px] text-zinc-500">
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
  )

  return (
    <div className={`${shellClass} ${className}`}>
      {titleBlock}
      {searchBlock}

      {error ? (
        <p className="mx-5 mt-2 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      ) : null}

      <div className="relative mx-5 mb-5 mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-100 bg-[#f4f4f5] [background-image:radial-gradient(circle_at_center,rgba(161,161,170,0.14)_1px,transparent_1px)] [background-size:20px_20px]">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/40 to-transparent" />

        <div
          className="absolute right-3 top-3 z-20 flex flex-col gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoomAnchored(zoom + 0.08)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-base font-semibold text-zinc-700 shadow-[0_4px_12px_rgba(0,0,0,0.07)] transition-shadow duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.09)] active:scale-95"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoomAnchored(zoom - 0.08)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-base font-semibold text-zinc-700 shadow-[0_4px_12px_rgba(0,0,0,0.07)] transition-shadow duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.09)] active:scale-95"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Reset map view"
            onClick={handleResetView}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-[10px] font-bold uppercase tracking-wide text-zinc-600 shadow-[0_4px_12px_rgba(0,0,0,0.07)] transition-shadow duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.09)] active:scale-95"
          >
            ⟲
          </button>
        </div>

        <div
          ref={viewportRef}
          role="application"
          aria-label="Seating map — drag to pan"
          className="relative h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
          onPointerDown={onPointerDownViewport}
          onPointerMove={onPointerMoveViewport}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            data-seat-map-world
            className="relative will-change-transform"
            style={{
              width: WORLD_W,
              height: WORLD_H,
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: transitionTransform
                ? `transform ${TRANSFORM_MS}ms cubic-bezier(0.33, 0.9, 0.32, 1)`
                : 'none',
            }}
          >
            {LANDMARKS.map((lm) => (
              <div
                key={lm.name}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-200/90 bg-white/95 px-2.5 py-1 text-[10px] font-medium tracking-wide text-zinc-500 shadow-sm"
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

              const isSelectedTable = Boolean(table && selectedGuest?.table_id === table.id)
              const tableHex = table ? tableColors[table.id] ?? null : null
              const tableStyle = softTableBackground(tableHex, idx)

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
                    role={table ? 'button' : undefined}
                    tabIndex={table ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (!table) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setPressedTableId((id) => (id === table.id ? null : table.id))
                      }
                    }}
                    onClick={() => {
                      if (table) setPressedTableId((id) => (id === table.id ? null : table.id))
                    }}
                    className={`relative flex w-full flex-col overflow-visible rounded-2xl border text-left transition-[transform,box-shadow] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
                      table ? 'cursor-pointer hover:z-10 active:scale-[1.02]' : 'cursor-default opacity-60'
                    } ${
                      isSelectedTable || pressedTableId === table?.id
                        ? 'z-10 scale-[1.03] shadow-[0_12px_28px_rgba(0,0,0,0.1)]'
                        : 'shadow-[0_6px_16px_rgba(0,0,0,0.06)]'
                    }`}
                    style={{
                      background: tableStyle.background,
                      borderColor: tableStyle.borderColor,
                      boxShadow: isSelectedTable
                        ? `${tableStyle.shadow}, 0 0 0 2px rgba(139,92,246,0.22)`
                        : tableStyle.shadow,
                    }}
                  >
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 pt-1">
                      <span className="max-w-full truncate text-center text-[11px] font-semibold tracking-wide text-zinc-800/95">
                        {label}
                      </span>
                    </div>
                    {pressedTableId === table?.id ? (
                      <div className="pointer-events-none absolute -bottom-7 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-zinc-200/90 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-zinc-600 shadow-md">
                        Table {idx + 1} – {table?.name ?? label}
                      </div>
                    ) : null}
                    <div className="relative h-[76px] w-full">
                      {table
                        ? table.guests.map((g) => {
                            const pos = seatPosition(g.seat_number, SEAT_LAYOUT_CAPACITY)
                            const isSelectedSeat = selectedGuest?.id === g.id
                            return (
                              <button
                                key={g.id}
                                type="button"
                                ref={(el) => {
                                  seatRefs.current[g.id] = el
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  selectGuest(g)
                                }}
                                className={`absolute z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border text-[8px] font-bold leading-none transition-[transform,box-shadow] duration-200 ${
                                  pos.isTop
                                    ? 'top-0 -translate-y-1/2'
                                    : 'bottom-0 translate-y-1/2'
                                } ${
                                  isSelectedSeat
                                    ? 'animate-seat-glow border-white/90 z-20 scale-110 bg-white text-violet-700'
                                    : 'border-zinc-300/80 bg-white/95 text-zinc-600 shadow-sm hover:border-violet-300 hover:text-violet-800'
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
        </div>

        {selectedGuest ? (
          <aside className="pointer-events-auto absolute bottom-3 left-3 right-3 z-30 mx-auto max-w-md rounded-2xl border border-violet-200/80 bg-white/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(91,33,182,0.12)] backdrop-blur-sm transition-opacity duration-300">
            <div className="flex items-center gap-3 text-xs text-violet-950">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-violet-200 bg-white">
                {selectedGuest.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedGuest.photo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-violet-800">
                    {getInitials(selectedGuest.full_name)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-900">{selectedGuest.full_name}</p>
                <p className="mt-0.5 text-[11px] text-violet-800/85">
                  <span className="font-medium">{selectedGuest.table_name}</span>
                  <span className="mx-1.5 text-violet-400">·</span>
                  <span>Seat {selectedGuest.seat_number}</span>
                </p>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
