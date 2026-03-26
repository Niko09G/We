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
  { name: 'Lift Lobby', x: 5, y: 26 },
  { name: 'Reception', x: 5, y: 73 },
  { name: 'Kitchen', x: 19, y: 90 },
  { name: 'Activity / screen', x: 83, y: 34 },
  { name: 'Bar', x: 70, y: 80 },
] as const

const SEAT_LAYOUT_CAPACITY = 30
const WORLD_W = 720
const WORLD_H = 620

/** Overview: fully zoomed out; pan X nudged right vs world origin. */
const DEFAULT_ZOOM = 0.52
const FOCUS_ZOOM = 1.08
const ZOOM_MIN = 0.52
const ZOOM_MAX = 1.28
const TRANSFORM_MS = 280
const OVERVIEW_PAD_X = 38

/** Vertical gradients per layout slot (team identity). `blue` slot = Kaypoh Auntie’s. */
const TABLE_GRADIENT_BY_SLOT: Record<(typeof TABLE_LAYOUT_SLOTS)[number]['key'], string> = {
  gold: 'linear-gradient(to bottom, #f75f0c 0%, #fca16a 100%)',
  blue: 'linear-gradient(to bottom, #952dfe 0%, #5a35f9 50%, #889af9 100%)',
  red: 'linear-gradient(to bottom, #ff3b4a 0%, #ff997a 100%)',
  green: 'linear-gradient(to bottom, #0c8837 0%, #89c97d 100%)',
}

/** Subtle themed glow for the selected-guest bar (matches table slot). */
const TABLE_RESULT_GLOW_BY_SLOT: Record<(typeof TABLE_LAYOUT_SLOTS)[number]['key'], string> = {
  gold: '0 12px 36px rgba(247, 95, 12, 0.28), 0 0 0 1px rgba(247, 95, 12, 0.12)',
  blue: '0 12px 36px rgba(149, 45, 254, 0.26), 0 0 0 1px rgba(90, 53, 249, 0.14)',
  red: '0 12px 36px rgba(255, 59, 74, 0.28), 0 0 0 1px rgba(255, 59, 74, 0.12)',
  green: '0 12px 36px rgba(12, 136, 55, 0.26), 0 0 0 1px rgba(12, 136, 55, 0.12)',
}

/** Solid accent (first gradient stop) for rings and result icons. */
const TABLE_SOLID_ACCENT_BY_SLOT: Record<(typeof TABLE_LAYOUT_SLOTS)[number]['key'], string> = {
  gold: '#f75f0c',
  blue: '#952dfe',
  red: '#ff3b4a',
  green: '#0c8837',
}

/** Side-view table: thin tabletop + two legs (filled silhouette). */
function MapTableGlyph({ color }: { color: string }) {
  return (
    <svg className="shrink-0" width={17} height={17} viewBox="0 0 24 24" aria-hidden>
      <path
        fill={color}
        d="M3 5.5h18v3.5H3V5.5zM5 9h4v11H5V9zm10 0h4v11h-4V9z"
      />
    </svg>
  )
}

function MapSeatGlyph({ color }: { color: string }) {
  return (
    <svg className="shrink-0" width={17} height={17} viewBox="0 0 24 24" aria-hidden>
      {/* Filled chair: back + seat block — reads clearly at 17px */}
      <path
        fill={color}
        d="M8 5h8a2 2 0 012 2v2H6V7a2 2 0 012-2zm-2 7h12v7a1 1 0 01-1 1H7a1 1 0 01-1-1v-7z"
      />
    </svg>
  )
}

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

function tableFillStyle(slotKey: (typeof TABLE_LAYOUT_SLOTS)[number]['key']): {
  background: string
  borderColor: string
  shadow: string
} {
  const background = TABLE_GRADIENT_BY_SLOT[slotKey]
  return {
    background,
    borderColor: 'rgba(255,255,255,0.28)',
    shadow: '0 6px 18px rgba(0,0,0,0.12)',
  }
}

/** Subtle interior guides — matches `border-zinc-200` map frame; rendered behind tables/labels/seats. */
function SeatMapGuidelines() {
  const w = WORLD_W
  const h = WORLD_H
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
    >
      <g stroke="#e4e4e7" strokeWidth={1} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={w * 0.22} y1={42} x2={w * 0.22} y2={h - 44} />
        <line x1={w * 0.5} y1={52} x2={w * 0.5} y2={h - 52} />
        <line x1={20} y1={h * 0.28} x2={w - 20} y2={h * 0.28} />
        <line x1={20} y1={h * 0.42} x2={w - 20} y2={h * 0.42} />
        <line x1={20} y1={h * 0.58} x2={w - 20} y2={h * 0.58} />
      </g>
    </svg>
  )
}

type DragRef = { sx: number; sy: number; px: number; py: number }

export function SeatingMapPanel({
  className = '',
  layout = 'page',
  showSectionHeading = true,
  sectionTitle = 'Find your seat',
}: {
  className?: string
  layout?: 'page' | 'embedded'
  /** When false, parent renders the h2 (e.g. missions page). */
  showSectionHeading?: boolean
  /** Team/table page can override (e.g. “Find your people”); standalone seat page keeps default. */
  sectionTitle?: string
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
  const [dragging, setDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const seatRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const dragRef = useRef<DragRef | null>(null)
  const panZoomRef = useRef({ x: 0, y: 0, zoom: DEFAULT_ZOOM })
  const mapFrameRef = useRef<HTMLDivElement | null>(null)
  const pinchRef = useRef<{ d0: number; z0: number; wx: number; wy: number } | null>(null)

  useEffect(() => {
    panZoomRef.current = { x: pan.x, y: pan.y, zoom }
  }, [pan.x, pan.y, zoom])

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

  const selectedGuestSlotKey = useMemo((): (typeof TABLE_LAYOUT_SLOTS)[number]['key'] | null => {
    if (!selectedGuest) return null
    const idx = tableBySlot.findIndex((t) => t?.id === selectedGuest.table_id)
    if (idx < 0) return null
    return TABLE_LAYOUT_SLOTS[idx]!.key
  }, [selectedGuest, tableBySlot])

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

  /** Zoomed-out overview: world’s left edge near viewport left, vertically centered. */
  const applyOverviewCamera = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const z = DEFAULT_ZOOM
    const panX = OVERVIEW_PAD_X
    const panY = vp.clientHeight / 2 - (WORLD_H * z) / 2
    setZoom(z)
    setPan({ x: panX, y: panY })
  }, [])

  useLayoutEffect(() => {
    if (loading) return
    const frame = mapFrameRef.current
    if (!frame) return
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => applyOverviewCamera())
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(frame)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [applyOverviewCamera, loading])

  /** Two-finger pinch zoom (non-passive so we can prevent browser zoom/scroll). */
  useEffect(() => {
    const el = viewportRef.current
    if (!el || loading) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      const t0 = e.touches[0]!
      const t1 = e.touches[1]!
      const d0 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      if (d0 < 10) return
      const mx = (t0.clientX + t1.clientX) / 2
      const my = (t0.clientY + t1.clientY) / 2
      const { x: px, y: py, zoom: z } = panZoomRef.current
      pinchRef.current = {
        d0,
        z0: z,
        wx: (mx - px) / z,
        wy: (my - py) / z,
      }
      setTransitionTransform(false)
    }

    const onTouchMove = (e: TouchEvent) => {
      const p = pinchRef.current
      if (!p || e.touches.length < 2) return
      e.preventDefault()
      const t0 = e.touches[0]!
      const t1 = e.touches[1]!
      const d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      const mx = (t0.clientX + t1.clientX) / 2
      const my = (t0.clientY + t1.clientY) / 2
      const zn = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, p.z0 * (d / p.d0)))
      setZoom(zn)
      setPan({ x: mx - p.wx * zn, y: my - p.wy * zn })
    }

    const endPinch = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', endPinch)
    el.addEventListener('touchcancel', endPinch)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', endPinch)
      el.removeEventListener('touchcancel', endPinch)
    }
  }, [loading])

  /** While dragging the map, block page scroll on touch devices. */
  useEffect(() => {
    if (!dragging) return
    const blockScroll = (e: TouchEvent) => {
      e.preventDefault()
    }
    document.body.addEventListener('touchmove', blockScroll, { passive: false })
    return () => document.body.removeEventListener('touchmove', blockScroll)
  }, [dragging])

  /** Wheel over map stays on the map (no competing page scroll). */
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [loading])

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

  const outerClass =
    layout === 'page'
      ? 'flex min-h-0 flex-col overflow-visible'
      : 'flex min-h-0 w-full flex-col overflow-visible'

  const titleBlock = showSectionHeading ? (
    <div className="shrink-0">
      <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">{sectionTitle}</h2>
      <p className="mt-1 text-left text-base text-zinc-500">
        Search your name or explore the tables
      </p>
    </div>
  ) : null

  const searchBlock = (
    <div
      className={`relative shrink-0 ${showSectionHeading ? 'mt-4' : layout === 'embedded' ? 'mt-0' : 'mt-4'}`}
    >
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
        placeholder="Search name"
        className="relative z-10 w-full rounded-full border border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors duration-200 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-200/60"
      />
      {search.trim().length > 0 && !searchResultsDismissed ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
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
    <div className={`${outerClass} ${className}`}>
      {titleBlock}
      {searchBlock}

      {error ? (
        <p className="mt-2 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      ) : null}

      <div
        ref={mapFrameRef}
        className="relative mt-3 aspect-square w-full max-h-[min(92vw,360px)] shrink-0 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50/90"
      >
        <div
          className="absolute right-3 top-3 z-20 flex flex-col gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoomAnchored(zoom + 0.08)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-950 bg-zinc-900 text-lg font-semibold leading-none text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition active:scale-95"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoomAnchored(zoom - 0.08)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-950 bg-zinc-900 text-lg font-semibold leading-none text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition active:scale-95"
          >
            −
          </button>
        </div>

        <div
          ref={viewportRef}
          role="application"
          aria-label="Seating map — drag to pan"
          className="relative h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
          style={{ touchAction: 'none' }}
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
            <SeatMapGuidelines />
            {LANDMARKS.map((lm) => (
              <div
                key={lm.name}
                className="absolute z-[5] -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-200/90 bg-white/95 px-2.5 py-1 text-[10px] font-medium tracking-wide text-zinc-500 shadow-sm"
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
              const tableStyle = tableFillStyle(slot.key)
              const slotAccent = TABLE_SOLID_ACCENT_BY_SLOT[slot.key]

              return (
                <div
                  key={slot.key}
                  ref={(el) => {
                    if (table) tableRefs.current[table.id] = el
                  }}
                  className="absolute z-[6] w-[min(90vw,500px)] max-w-[68%] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                >
                  <div
                    className={`pointer-events-none relative flex w-full flex-col overflow-visible rounded-2xl border text-left transition-[transform,box-shadow] duration-200 ease-out ${
                      table ? '' : 'cursor-default opacity-55'
                    } ${
                      isSelectedTable ? 'z-10 shadow-[0_14px_32px_rgba(0,0,0,0.18)]' : ''
                    } ${!table ? 'border-zinc-200 bg-zinc-100 shadow-none' : ''}`}
                    style={
                      table
                        ? {
                            background: tableStyle.background,
                            borderColor: tableStyle.borderColor,
                            boxShadow: isSelectedTable
                              ? `${tableStyle.shadow}, 0 0 0 3px rgba(255,255,255,0.85)`
                              : tableStyle.shadow,
                          }
                        : undefined
                    }
                  >
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 pt-1">
                      <span
                        className={`max-w-full truncate text-center text-[11px] font-semibold tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${
                          table ? 'text-white' : 'text-zinc-600'
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    <div className="relative h-[76px] w-full pointer-events-auto">
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
                                onClick={() => selectGuest(g)}
                                className={`absolute z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border-2 text-[10px] font-extrabold leading-none transition-[transform,box-shadow] duration-200 ${
                                  pos.isTop
                                    ? 'top-0 -translate-y-1/2'
                                    : 'bottom-0 translate-y-1/2'
                                } ${
                                  isSelectedSeat
                                    ? 'animate-seat-selected-glow z-30 scale-110 border-white bg-white'
                                    : 'border-zinc-300 bg-white shadow-sm hover:border-zinc-400'
                                }`}
                                style={{
                                  left: `${pos.leftPct}%`,
                                  ...(isSelectedSeat
                                    ? ({ ['--seat-accent' as string]: slotAccent } as React.CSSProperties)
                                    : undefined),
                                }}
                                title={`${g.full_name} · Seat ${g.seat_number}`}
                              >
                                {g.photo_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={g.photo_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center bg-zinc-200 text-[9px] font-bold text-zinc-700">
                                    {getInitials(g.full_name)}
                                  </span>
                                )}
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
          <aside
            className="pointer-events-auto absolute bottom-3 left-3 right-3 z-30 mx-auto max-w-md rounded-2xl border border-white/80 bg-white/95 px-4 py-3.5 backdrop-blur-sm transition-[box-shadow,opacity] duration-300"
            style={{
              boxShadow: selectedGuestSlotKey
                ? TABLE_RESULT_GLOW_BY_SLOT[selectedGuestSlotKey]
                : '0 10px 28px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div className="flex items-center gap-4 text-black">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-white">
                {selectedGuest.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedGuest.photo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-600">
                    {getInitials(selectedGuest.full_name)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-black">{selectedGuest.full_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-medium text-black">
                  <span className="flex min-w-0 max-w-full flex-1 basis-0 items-center gap-2">
                    <MapTableGlyph
                      color={
                        selectedGuestSlotKey
                          ? TABLE_SOLID_ACCENT_BY_SLOT[selectedGuestSlotKey]
                          : '#71717a'
                      }
                    />
                    <span className="min-w-0 break-words leading-snug text-black [overflow-wrap:anywhere]">
                      {selectedGuest.table_name}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2 pr-1">
                    <MapSeatGlyph
                      color={
                        selectedGuestSlotKey
                          ? TABLE_SOLID_ACCENT_BY_SLOT[selectedGuestSlotKey]
                          : '#71717a'
                      }
                    />
                    <span className="whitespace-nowrap pr-1 text-black">Seat {selectedGuest.seat_number}</span>
                  </span>
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
