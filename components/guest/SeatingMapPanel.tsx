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
  computeFourSideCounts,
  guestTableSeatMapMetrics,
  MAX_SEAT_MAP_CAPACITY,
  seatSizingForRowWidthWithSideCounts,
  seatSizingForSideCounts,
} from '@/lib/seat-map-layout'
import { teamPageAdminFormDefaults } from '@/lib/team-page-config'
import { loadGuestFloorLayout } from '@/lib/admin-floor-layout'
import { SeatMapLandmarksLayer, SeatMapSearchInput, SeatLogisticsBadges, type SeatMapLandmark, SEAT_MAP_WORLD_WIDTH, SEAT_MAP_WORLD_HEIGHT, SEAT_MAP_ZOOM_MIN, SEAT_MAP_ZOOM_STEP, SEAT_MAP_ZOOM_DEFAULT, SEAT_MAP_ZOOM_MAX, clampSeatMapTransform, createSeatMapPointerHandlers, SEAT_MAP_VIEWPORT_TOUCH_ACTION } from '@/components/SeatMap'
import {
  FLOOR_GRID_COLS,
  FLOOR_GRID_ROWS,
  gridRectToPercentBounds,
  normalizeFloorRect,
  resolveTableGridUnits,
  tableGridUnitsForCapacity,
} from '@/lib/floor-layout'
import {
  groupTablesByTeamId,
  pickPrimaryTableForTeam,
  resolveTeamId,
} from '@/lib/table-teams'

type SeatFinderGuest = {
  id: string
  full_name: string
  photo_url: string | null
  table_id: string
  seat_number: number
  dietary_restrictions?: string[] | null
  needs_baby_chair?: boolean
  needs_kids_menu?: boolean
}

type SeatFinderTable = {
  id: string
  name: string
  color: string | null
  capacity: number
  display_order: number
  page_config: unknown
  is_active?: boolean
  is_archived?: boolean
  team_id: string
  grid_x: number | null
  grid_y: number | null
  width_units: number
  height_units: number
}

type MapLandmark = SeatMapLandmark

type GuestWithTable = SeatFinderGuest & {
  table_name: string
  team_id: string
}

type TableVisual = {
  background: string
  borderColor: string
  shadow: string
  accent: string
  resultGlow: string
}

type TableOnMap = {
  id: string
  name: string
  capacity: number
  display_order: number
  team_id: string
  guests: GuestWithTable[]
  visual: TableVisual
  bounds: { left: number; top: number; width: number; height: number }
  slotKey: MapSlotKey
  isTwin: boolean
}

const MAP_SLOT_KEYS = ['gold', 'blue', 'red', 'green'] as const
type MapSlotKey = (typeof MAP_SLOT_KEYS)[number]

/** Vertical team lanes on the guest map. Sibling physical blocks share a lane. */
const TEAM_LANE_Y = [18, 35, 52, 69] as const
const MAP_CENTER_X = 50
const PAIR_XS = [28, 72] as const

const WORLD_W = SEAT_MAP_WORLD_WIDTH
const WORLD_H = SEAT_MAP_WORLD_HEIGHT

const FOCUS_ZOOM = 1.08
const ZOOM_MIN = SEAT_MAP_ZOOM_MIN
const ZOOM_STEP = SEAT_MAP_ZOOM_STEP
const ZOOM_DEFAULT = SEAT_MAP_ZOOM_DEFAULT
const ZOOM_MAX = SEAT_MAP_ZOOM_MAX
const TRANSFORM_MS = 280

function applyBoundedTransform(
  viewport: HTMLDivElement | null,
  pan: { x: number; y: number },
  zoom: number
): { pan: { x: number; y: number }; zoom: number } {
  if (!viewport) return { pan, zoom }
  return clampSeatMapTransform(pan, zoom, viewport.clientWidth, viewport.clientHeight)
}

/** Vertical gradients per layout slot (team identity). */
const TABLE_GRADIENT_BY_SLOT: Record<MapSlotKey, string> = {
  gold: 'linear-gradient(to bottom, #f75f0c 0%, #fca16a 100%)',
  blue: 'linear-gradient(to bottom, #952dfe 0%, #5a35f9 50%, #889af9 100%)',
  red: 'linear-gradient(to bottom, #ff3b4a 0%, #ff997a 100%)',
  green: 'linear-gradient(to bottom, #0c8837 0%, #89c97d 100%)',
}

/** Subtle themed glow for the selected-guest bar (matches table slot). */
const TABLE_RESULT_GLOW_BY_SLOT: Record<MapSlotKey, string> = {
  gold: '0 12px 36px rgba(247, 95, 12, 0.28), 0 0 0 1px rgba(247, 95, 12, 0.12)',
  blue: '0 12px 36px rgba(149, 45, 254, 0.26), 0 0 0 1px rgba(90, 53, 249, 0.14)',
  red: '0 12px 36px rgba(255, 59, 74, 0.28), 0 0 0 1px rgba(255, 59, 74, 0.12)',
  green: '0 12px 36px rgba(12, 136, 55, 0.26), 0 0 0 1px rgba(12, 136, 55, 0.12)',
}

/** Solid accent (first gradient stop) for rings and result icons. */
const TABLE_SOLID_ACCENT_BY_SLOT: Record<MapSlotKey, string> = {
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
        d="M3 5.5h18v3.5H3V5.5zM5.5 9h3.5v11H5.5V9zm9.5 0h3.5v11H15V9z"
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

function spreadLaneXs(count: number): number[] {
  if (count <= 1) return [MAP_CENTER_X]
  if (count === 2) return [...PAIR_XS]
  const start = 22
  const end = 78
  return Array.from({ length: count }, (_, i) => start + ((end - start) * i) / Math.max(1, count - 1))
}

function boundsFromCenter(x: number, y: number, capacity: number): {
  left: number
  top: number
  width: number
  height: number
} {
  const span = tableGridUnitsForCapacity(capacity)
  return gridRectToPercentBounds(
    normalizeFloorRect(
      {
        grid_x: Math.round((x / 100) * FLOOR_GRID_COLS - span.width_units / 2),
        grid_y: Math.round((y / 100) * FLOOR_GRID_ROWS - span.height_units / 2),
        width_units: span.width_units,
        height_units: span.height_units,
      },
      { w: span.width_units, h: span.height_units }
    )
  )
}

function accentGlowShadow(accent: string, fallback: string): string {
  const h = accent.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) return fallback
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `0 12px 36px rgba(${r},${g},${b},0.28), 0 0 0 1px rgba(${r},${g},${b},0.12)`
}

function tableVisualFromTeam(
  color: string | null,
  pageConfig: unknown,
  tableName: string,
  slotKey: MapSlotKey
): TableVisual {
  const d = teamPageAdminFormDefaults(pageConfig, { tableColor: color, tableName })
  const top = d.tableGradTop.trim()
  const bottom = d.tableGradBottom.trim()
  const accent = d.primaryColor.trim() || top || TABLE_SOLID_ACCENT_BY_SLOT[slotKey]
  const background =
    top && bottom
      ? `linear-gradient(to bottom, ${top} 0%, ${bottom} 100%)`
      : TABLE_GRADIENT_BY_SLOT[slotKey]
  const fallbackGlow = TABLE_RESULT_GLOW_BY_SLOT[slotKey]
  return {
    background,
    borderColor: 'rgba(255,255,255,0.28)',
    shadow: '0 6px 18px rgba(0,0,0,0.12)',
    accent,
    resultGlow: accentGlowShadow(accent, fallbackGlow),
  }
}

function GuestTableSeatMap({
  capacity,
  guests,
  tableAccent,
  selectedGuestId,
  onSelectGuest,
  tableLabel,
  suppressPointerEvents = false,
  showLogistics = false,
}: {
  capacity: number
  guests: GuestWithTable[]
  tableAccent: string
  selectedGuestId: string | null
  onSelectGuest: (guest: GuestWithTable) => void
  tableLabel: React.ReactNode
  /** During pan/zoom transitions, disable hit targets on scaled seats/rings. */
  suppressPointerEvents?: boolean
  showLogistics?: boolean
}) {
  const middleRef = useRef<HTMLDivElement>(null)
  const [middleW, setMiddleW] = useState(0)

  const safeCapacity = Math.min(MAX_SEAT_MAP_CAPACITY, Math.max(1, Math.trunc(capacity)))

  useLayoutEffect(() => {
    const el = middleRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setMiddleW(el.clientWidth))
    ro.observe(el)
    setMiddleW(el.clientWidth)
    return () => ro.disconnect()
  }, [safeCapacity])

  const bySeat = useMemo(() => {
    const m = new Map<number, GuestWithTable>()
    for (const g of guests) {
      const sn = Math.trunc(g.seat_number)
      if (sn >= 1 && sn <= safeCapacity) m.set(sn, g)
    }
    return m
  }, [guests, safeCapacity])

  const { leftEndSeat, topStart, topCount, rightEndSeat, bottomStart, bottomCount } =
    computeFourSideCounts(safeCapacity)
  const baseSizing = seatSizingForSideCounts(topCount, bottomCount)
  const topSizing =
    middleW > 0 && topCount > 0
      ? seatSizingForRowWidthWithSideCounts(topCount, bottomCount, middleW, 'top')
      : baseSizing
  const bottomSizing =
    middleW > 0 && bottomCount > 0
      ? seatSizingForRowWidthWithSideCounts(topCount, bottomCount, middleW, 'bottom')
      : baseSizing
  const endCapSeatPx = Math.max(topSizing.seatPx, bottomSizing.seatPx)
  const layoutMetrics = guestTableSeatMapMetrics(topSizing, bottomSizing, {
    seatPx: leftEndSeat != null || rightEndSeat != null ? endCapSeatPx : 0,
  })

  const renderSeat = (seatNum: number, size: number) => {
    const guest = bySeat.get(seatNum)
    const isSelected = guest?.id === selectedGuestId

    if (!guest) {
      return (
        <div
          key={seatNum}
          aria-hidden
          className="shrink-0 rounded-full"
          style={{ width: size, height: size }}
        />
      )
    }

    const badgeScale = size / 28

    return (
      <div
        key={guest.id}
        className="relative shrink-0"
        style={{ width: size, height: size, flexShrink: 0 }}
      >
        <button
          type="button"
          onClick={() => onSelectGuest(guest)}
          className={`absolute left-1/2 top-1/2 rounded-full transition-[box-shadow,border-color,transform] duration-200 ${
            isSelected
              ? 'animate-seat-selected-glow z-40 overflow-visible will-change-transform'
              : 'overflow-hidden border border-zinc-300/70 hover:border-zinc-400'
          } ${suppressPointerEvents ? 'pointer-events-none' : ''}`}
          style={{
            width: size,
            height: size,
            transform: isSelected ? 'translate(-50%, -50%) scale(1.4)' : 'translate(-50%, -50%)',
            ...(isSelected
              ? ({
                  ['--seat-accent' as string]: tableAccent,
                  zIndex: 40,
                  willChange: 'transform',
                } as React.CSSProperties)
              : undefined),
          }}
          title={`${guest.full_name} · Seat ${guest.seat_number}`}
        >
          {guest.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={guest.photo_url}
              alt=""
              className={`block h-full w-full rounded-full object-cover ${
                isSelected ? 'border-2 border-white' : ''
              }`}
            />
          ) : (
            <span
              className={`flex h-full w-full items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-700 ${
                isSelected ? 'border-2 border-white' : ''
              }`}
            >
              {getInitials(guest.full_name)}
            </span>
          )}
        </button>
        <SeatLogisticsBadges
          showLogistics={showLogistics}
          dietary_restrictions={guest.dietary_restrictions}
          needs_baby_chair={guest.needs_baby_chair}
          needs_kids_menu={guest.needs_kids_menu}
          scale={badgeScale}
        />
      </div>
    )
  }

  const renderSide = (
    sideStart: number,
    sideEnd: number,
    sizing: { seatPx: number; gapPx: number }
  ) => {
    const count = Math.max(0, sideEnd - sideStart + 1)
    if (count <= 0) return null

    return (
      <div
        className="mx-auto flex max-w-full items-center justify-center overflow-visible"
        style={{ gap: `${sizing.gapPx}px` }}
      >
        {Array.from({ length: count }, (_, i) => renderSeat(sideStart + i, sizing.seatPx))}
      </div>
    )
  }

  const topEnd = topCount > 0 ? topStart + topCount - 1 : topStart - 1
  const bottomEnd = bottomCount > 0 ? bottomStart + bottomCount - 1 : bottomStart - 1

  return (
    <div
      className="w-full min-w-0 overflow-visible px-1"
      style={{
        paddingTop: layoutMetrics.edgePaddingTop,
        paddingBottom: layoutMetrics.edgePaddingBottom,
      }}
    >
      <div className="grid w-full min-w-0 grid-cols-[auto_1fr_auto] items-center gap-x-0.5 overflow-visible">
        <div
          className="flex shrink-0 items-center justify-center overflow-visible"
          style={{ width: leftEndSeat != null ? endCapSeatPx : 0 }}
        >
          {leftEndSeat != null ? renderSeat(leftEndSeat, endCapSeatPx) : null}
        </div>

        <div ref={middleRef} className="min-h-0 min-w-0 overflow-visible">
          <div
            className="relative flex min-h-0 min-w-0 flex-col justify-center overflow-visible"
            style={{ minHeight: layoutMetrics.centerBandPx }}
          >
            {topCount > 0 ? (
              <div className="pointer-events-auto z-[3] -translate-y-1/2 overflow-visible">
                {renderSide(topStart, topEnd, topSizing)}
              </div>
            ) : null}
            <div className="flex h-6 w-full min-w-0 shrink-0 items-center justify-center overflow-hidden px-1">
              {tableLabel}
            </div>
            {bottomCount > 0 ? (
              <div className="pointer-events-auto z-[3] translate-y-1/2 overflow-visible">
                {renderSide(bottomStart, bottomEnd, bottomSizing)}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="flex shrink-0 items-center justify-center overflow-visible"
          style={{ width: rightEndSeat != null ? endCapSeatPx : 0 }}
        >
          {rightEndSeat != null ? renderSeat(rightEndSeat, endCapSeatPx) : null}
        </div>
      </div>
    </div>
  )
}

type DragRef = { sx: number; sy: number; px: number; py: number }

export function SeatingMapPanel({
  className = '',
  layout = 'page',
  showSectionHeading = true,
  sectionTitle = 'Find your seat',
  viewerAccentColor,
}: {
  className?: string
  layout?: 'page' | 'embedded'
  /** When false, parent renders the h2 (e.g. missions page). */
  showSectionHeading?: boolean
  /** Team/table page can override (e.g. “Find your people”); standalone seat page keeps default. */
  sectionTitle?: string
  /** Optional team accent for search focus/selection on embedded team pages. */
  viewerAccentColor?: string
}) {
  const [rows, setRows] = useState<GuestWithTable[]>([])
  const [tableCatalog, setTableCatalog] = useState<SeatFinderTable[]>([])
  const [landmarks, setLandmarks] = useState<MapLandmark[]>([])
  const [layoutSchemaReady, setLayoutSchemaReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResultsDismissed, setSearchResultsDismissed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [transitionTransform, setTransitionTransform] = useState(false)
  const [dragging, setDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const dragRef = useRef<DragRef | null>(null)
  const pendingDragRef = useRef<DragRef | null>(null)
  const dragMovedRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)
  const panZoomRef = useRef({ x: 0, y: 0, zoom: ZOOM_DEFAULT })
  const mapFrameRef = useRef<HTMLDivElement | null>(null)
  const pinchRef = useRef<{ d0: number; z0: number; wx: number; wy: number } | null>(null)

  useEffect(() => {
    panZoomRef.current = { x: pan.x, y: pan.y, zoom }
  }, [pan.x, pan.y, zoom])

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    async function load() {
      setError(null)
      setLoading(true)
      try {
        const [attendeesRes, floorLayout] = await Promise.all([
          supabase
            .from('attendees')
            .select('id, full_name, photo_url, table_id, seat_number')
            .eq('is_archived', false)
            .not('table_id', 'is', null)
            .not('seat_number', 'is', null),
          loadGuestFloorLayout().catch(() => null),
        ])

        if (attendeesRes.error) throw attendeesRes.error

        let tables: SeatFinderTable[] = (floorLayout?.tables ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color,
          capacity: row.capacity,
          display_order: row.display_order,
          page_config: null,
          is_active: row.is_active,
          is_archived: row.is_archived,
          team_id: row.team_id,
          grid_x: row.grid_x,
          grid_y: row.grid_y,
          width_units: row.width_units,
          height_units: row.height_units,
        }))

        if (tables.length === 0) {
          const tablesRes = await supabase
            .from('tables')
            .select(
              'id, name, color, capacity, display_order, page_config, is_active, is_archived, team_id, grid_x, grid_y, width_units, height_units'
            )
            .eq('is_archived', false)
            .eq('is_active', true)
            .order('display_order')
            .order('name')
          if (tablesRes.error) throw tablesRes.error
          for (const row of tablesRes.data ?? []) {
            const r = row as Record<string, unknown>
            const cap = r.capacity
            const ord = r.display_order
            const units = resolveTableGridUnits(
              typeof cap === 'number' && Number.isFinite(cap) && cap >= 1
                ? Math.trunc(cap)
                : 10,
              {
                width_units:
                  typeof r.width_units === 'number' && Number.isFinite(r.width_units)
                    ? Math.trunc(r.width_units)
                    : undefined,
                height_units:
                  typeof r.height_units === 'number' && Number.isFinite(r.height_units)
                    ? Math.trunc(r.height_units)
                    : undefined,
              }
            )
            tables.push({
              id: row.id as string,
              name: (row.name as string) ?? '',
              color: (r.color as string | null) ?? null,
              capacity:
                typeof cap === 'number' && Number.isFinite(cap) && cap >= 1
                  ? Math.trunc(cap)
                  : 10,
              display_order:
                typeof ord === 'number' && Number.isFinite(ord) ? Math.trunc(ord) : 0,
              page_config: r.page_config ?? null,
              is_active: (r.is_active as boolean | undefined) ?? true,
              is_archived: (r.is_archived as boolean | undefined) ?? false,
              team_id: resolveTeamId({
                id: row.id as string,
                team_id: (r.team_id as string | null | undefined) ?? null,
              }),
              grid_x: typeof r.grid_x === 'number' ? Math.trunc(r.grid_x) : null,
              grid_y: typeof r.grid_y === 'number' ? Math.trunc(r.grid_y) : null,
              width_units: units.width_units,
              height_units: units.height_units,
            })
          }
        } else {
          const pageConfigRes = await supabase
            .from('tables')
            .select('id, page_config')
            .in(
              'id',
              tables.map((t) => t.id)
            )
          if (!pageConfigRes.error) {
            const configById = new Map(
              (pageConfigRes.data ?? []).map((row) => [
                row.id as string,
                (row as { page_config?: unknown }).page_config ?? null,
              ])
            )
            for (const t of tables) {
              t.page_config = configById.get(t.id) ?? null
            }
          }
        }

        if (floorLayout) {
          setLayoutSchemaReady(floorLayout.layoutSchemaReady)
        }

        if (floorLayout?.landmarks?.length) {
          setLandmarks(
            floorLayout.landmarks.map((lm) => {
              const bounds = gridRectToPercentBounds(lm)
              return {
                id: lm.id,
                name: lm.label,
                shape: lm.shape,
                color: lm.color,
                rotation: lm.rotation,
                is_line: lm.is_line,
                grid_x: lm.grid_x,
                grid_y: lm.grid_y,
                width_units: lm.width_units,
                height_units: lm.height_units,
                ...bounds,
              }
            })
          )
        } else {
          setLandmarks([])
        }
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
            team_id:
              tables.find((t) => t.id === r.table_id)?.team_id ?? (r.table_id as string),
          }))
          .sort((a, b) =>
            a.full_name.localeCompare(b.full_name, undefined, {
              sensitivity: 'base',
            })
          )

        setRows(normalized)
        setTableCatalog(tables)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load seats.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const tablesUsed = useMemo((): TableOnMap[] => {
    const guestByTable = new Map<string, GuestWithTable[]>()
    for (const r of rows) {
      if (!guestByTable.has(r.table_id)) guestByTable.set(r.table_id, [])
      guestByTable.get(r.table_id)!.push(r)
    }

    const orderedTables = [...tableCatalog].sort((a, b) => {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

    const teams = [...groupTablesByTeamId(orderedTables).entries()].sort((a, b) => {
      const minOrd = (members: SeatFinderTable[]) =>
        Math.min(...members.map((t) => t.display_order))
      const d = minOrd(a[1]) - minOrd(b[1])
      if (d !== 0) return d
      return a[1][0]!.name.localeCompare(b[1][0]!.name, undefined, { sensitivity: 'base' })
    })

    const placed: TableOnMap[] = []
    const placedFromGrid = new Set<string>()

    for (const meta of orderedTables) {
      if (!layoutSchemaReady) continue
      if (meta.grid_x == null || meta.grid_y == null) continue
      const teamId = meta.team_id
      const laneIdx = teams.findIndex(([id]) => id === teamId)
      const slotKey = MAP_SLOT_KEYS[Math.max(0, laneIdx)] ?? MAP_SLOT_KEYS[0]!
      const teamMembers = teams.find(([id]) => id === teamId)?.[1] ?? [meta]
      const primary = pickPrimaryTableForTeam(teamMembers, teamId)
      const visual = tableVisualFromTeam(primary.color, primary.page_config, primary.name, slotKey)
      const units = resolveTableGridUnits(meta.capacity, {
        width_units: meta.width_units,
        height_units: meta.height_units,
      })
      const bounds = gridRectToPercentBounds({
        grid_x: meta.grid_x,
        grid_y: meta.grid_y,
        width_units: units.width_units,
        height_units: units.height_units,
      })
      const guests = [...(guestByTable.get(meta.id) ?? [])].sort(
        (a, b) => a.seat_number - b.seat_number
      )
      placed.push({
        id: meta.id,
        name: meta.name,
        capacity: meta.capacity,
        display_order: meta.display_order,
        team_id: teamId,
        guests,
        visual,
        bounds,
        slotKey,
        isTwin: teamMembers.length > 1,
      })
      placedFromGrid.add(meta.id)
    }

    teams.slice(0, TEAM_LANE_Y.length).forEach(([teamId, members], laneIdx) => {
      const slotKey = MAP_SLOT_KEYS[laneIdx]!
      const y = TEAM_LANE_Y[laneIdx]!
      const sortedMembers = [...members]
        .filter((m) => !placedFromGrid.has(m.id))
        .sort((a, b) => {
          if (a.display_order !== b.display_order) return a.display_order - b.display_order
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        })
      if (sortedMembers.length === 0) return
      const xs = spreadLaneXs(sortedMembers.length)
      const primary = pickPrimaryTableForTeam(sortedMembers, teamId)
      const visual = tableVisualFromTeam(primary.color, primary.page_config, primary.name, slotKey)
      const isTwin = sortedMembers.length > 1

      sortedMembers.forEach((meta, i) => {
        const guests = [...(guestByTable.get(meta.id) ?? [])].sort(
          (a, b) => a.seat_number - b.seat_number
        )
        const centerX = xs[i] ?? MAP_CENTER_X
        placed.push({
          id: meta.id,
          name: meta.name,
          capacity: meta.capacity,
          display_order: meta.display_order,
          team_id: teamId,
          guests,
          visual,
          bounds: boundsFromCenter(centerX, y, meta.capacity),
          slotKey,
          isTwin,
        })
      })
    })

    return placed
  }, [rows, tableCatalog, layoutSchemaReady])

  const selectedGuest = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  )

  const selectedGuestVisual = useMemo((): TableVisual | null => {
    if (!selectedGuest) return null
    const table = tablesUsed.find((t) => t.id === selectedGuest.table_id)
    return table?.visual ?? null
  }, [selectedGuest, tablesUsed])

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

  /** Default map view: one zoom step above minimum, centered on the floor plan. */
  const applyOverviewCamera = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const z = ZOOM_DEFAULT
    const { pan: bounded } = applyBoundedTransform(
      vp,
      {
        x: (vp.clientWidth - WORLD_W * z) / 2,
        y: (vp.clientHeight - WORLD_H * z) / 2,
      },
      z
    )
    setZoom(z)
    setPan(bounded)
  }, [])

  const clearSelectionAndResetView = useCallback(() => {
    setSelectedId(null)
    setSearch('')
    setSearchResultsDismissed(false)
    setTransitionTransform(true)
    applyOverviewCamera()
    window.setTimeout(() => setTransitionTransform(false), TRANSFORM_MS + 40)
  }, [applyOverviewCamera])

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

  /** Two-finger pinch zoom — non-passive touchmove only while pinching so vertical page scroll stays native. */
  useEffect(() => {
    const el = viewportRef.current
    if (!el || loading) return

    let pinchMoveListener: ((e: TouchEvent) => void) | null = null

    const removePinchMoveListener = () => {
      if (!pinchMoveListener) return
      el.removeEventListener('touchmove', pinchMoveListener)
      pinchMoveListener = null
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
      const nextPan = { x: mx - p.wx * zn, y: my - p.wy * zn }
      const bounded = applyBoundedTransform(el, nextPan, zn)
      setZoom(bounded.zoom)
      setPan(bounded.pan)
    }

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
      if (!pinchMoveListener) {
        pinchMoveListener = onTouchMove
        el.addEventListener('touchmove', pinchMoveListener, { passive: false })
      }
    }

    const endPinch = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current = null
        removePinchMoveListener()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', endPinch)
    el.addEventListener('touchcancel', endPinch)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      removePinchMoveListener()
      el.removeEventListener('touchend', endPinch)
      el.removeEventListener('touchcancel', endPinch)
    }
  }, [loading, applyBoundedTransform])

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
    const table = tablesUsed.find((t) => t.id === selectedGuest.table_id)
    if (!table) return
    const wx = ((table.bounds.left + table.bounds.width / 2) / 100) * WORLD_W
    const wy = ((table.bounds.top + table.bounds.height / 2) / 100) * WORLD_H

    setTransitionTransform(true)
    const z = FOCUS_ZOOM
    const bounded = applyBoundedTransform(
      viewportRef.current,
      centerPanForWorldPoint(wx, wy, z),
      z
    )
    setZoom(bounded.zoom)
    setPan(bounded.pan)
    const t = window.setTimeout(() => setTransitionTransform(false), TRANSFORM_MS + 40)
    return () => window.clearTimeout(t)
  }, [selectedGuest, tablesUsed, centerPanForWorldPoint])

  const setZoomAnchored = (next: number) => {
    const el = viewportRef.current
    if (!el) return
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    const Vcx = el.clientWidth / 2
    const Vcy = el.clientHeight / 2
    const worldX = (Vcx - pan.x) / zoom
    const worldY = (Vcy - pan.y) / zoom
    const bounded = applyBoundedTransform(
      el,
      { x: Vcx - worldX * z, y: Vcy - worldY * z },
      z
    )
    setZoom(bounded.zoom)
    setPan(bounded.pan)
  }

  const viewportPointerHandlers = createSeatMapPointerHandlers({
    pan,
    zoom,
    dragging,
    setDragging,
    setPan: (nextPan) => setPan(nextPan),
    dragRef,
    dragMovedRef,
    pendingDragRef,
    applyBoundedTransform: (nextPan, nextZoom) =>
      applyBoundedTransform(viewportRef.current, nextPan, nextZoom),
    setTransitionTransform,
    onNeutralBackdropTap: (e) => {
      const t = e.target as HTMLElement
      const onNeutralBackdrop =
        !t.closest('button') &&
        !t.closest('[data-seat-map-table]') &&
        Boolean(t.closest('[data-seat-map-world]'))
      if (onNeutralBackdrop && selectedIdRef.current) {
        clearSelectionAndResetView()
      }
    },
  })

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

  const accentCssVar =
    viewerAccentColor?.trim() &&
    /^#?[0-9a-fA-F]{3,8}$/.test(viewerAccentColor.trim())
      ? ({
          ['--viewer-accent' as string]: viewerAccentColor.trim().startsWith('#')
            ? viewerAccentColor.trim()
            : `#${viewerAccentColor.trim()}`,
        } as React.CSSProperties)
      : undefined

  const searchBlock = (
    <div
      className={`relative shrink-0 ${showSectionHeading ? 'mt-4' : layout === 'embedded' ? 'mt-0' : 'mt-4'}`}
      style={accentCssVar}
    >
      <SeatMapSearchInput
        inputRef={inputRef}
        accentCssVar={accentCssVar}
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
                      selectedId === g.id && !accentCssVar ? 'bg-violet-50' : ''
                    }`}
                    style={
                      selectedId === g.id && accentCssVar
                        ? {
                            backgroundColor:
                              'color-mix(in srgb, var(--viewer-accent) 12%, white)',
                          }
                        : undefined
                    }
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
        className="relative mt-3 aspect-square w-full max-h-[min(92vw,360px)] shrink-0 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50/90 [touch-action:pan-y]"
      >
        <div
          className="absolute right-3 top-3 z-20 flex flex-col gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoomAnchored(zoom + ZOOM_STEP)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-950 bg-zinc-900 text-lg font-semibold leading-none text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition active:scale-95"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoomAnchored(zoom - ZOOM_STEP)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-950 bg-zinc-900 text-lg font-semibold leading-none text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition active:scale-95"
          >
            −
          </button>
        </div>

        <div
          ref={viewportRef}
          role="application"
          aria-label="Seating map — drag to pan"
          className="relative h-full w-full cursor-grab select-none active:cursor-grabbing [touch-action:pan-y]"
          style={{ touchAction: SEAT_MAP_VIEWPORT_TOUCH_ACTION }}
          onPointerDown={viewportPointerHandlers.onPointerDown}
          onPointerMove={viewportPointerHandlers.onPointerMove}
          onPointerUp={viewportPointerHandlers.onPointerUp}
          onPointerCancel={viewportPointerHandlers.onPointerCancel}
          onWheel={viewportPointerHandlers.onWheel}
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
            <SeatMapLandmarksLayer
              landmarks={landmarks}
              accentColor={viewerAccentColor ?? undefined}
            />
            {tablesUsed.map((table) => {
              const isSelectedTable = selectedGuest?.table_id === table.id
              const isSiblingTable = Boolean(
                selectedGuest &&
                  !isSelectedTable &&
                  selectedGuest.team_id === table.team_id
              )
              const tableStyle = table.visual
              const highlighted = isSelectedTable || isSiblingTable

              return (
                <div
                  key={table.id}
                  data-seat-map-table
                  ref={(el) => {
                    tableRefs.current[table.id] = el
                  }}
                  className="absolute z-[6] box-border overflow-visible"
                  style={{
                    left: `${table.bounds.left}%`,
                    top: `${table.bounds.top}%`,
                    width: `${table.bounds.width}%`,
                    height: `${table.bounds.height}%`,
                    minWidth: 0,
                    minHeight: 0,
                    contain: 'layout size',
                    willChange: 'transform',
                    transform: 'translate3d(0, 0, 0)',
                  }}
                >
                  <div
                    className={`pointer-events-none relative box-border flex h-full w-full min-h-0 min-w-0 flex-col overflow-visible rounded-2xl border text-left transition-[background,box-shadow,border-color,opacity] duration-200 ease-out ${
                      isSelectedTable
                        ? 'z-10 shadow-[0_14px_32px_rgba(0,0,0,0.18)]'
                        : isSiblingTable
                          ? 'z-[9] border-white/40'
                          : 'border-neutral-200/80 bg-white shadow-[0_6px_18px_rgba(0,0,0,0.12)]'
                    }`}
                    style={{
                      width: '100%',
                      height: '100%',
                      contain: 'layout style',
                      willChange: 'transform',
                      transform: 'translate3d(0, 0, 0)',
                      ...(isSelectedTable
                        ? {
                            background: tableStyle.background,
                            borderColor: tableStyle.borderColor,
                            boxShadow: `${tableStyle.shadow}, 0 0 0 3px rgba(255,255,255,0.85)`,
                          }
                        : isSiblingTable
                          ? {
                              background: tableStyle.background,
                              borderColor: tableStyle.borderColor,
                              boxShadow: `0 0 0 2px color-mix(in srgb, ${tableStyle.accent} 45%, transparent), 0 8px 20px rgba(0,0,0,0.1)`,
                              opacity: 0.72,
                            }
                          : undefined),
                    }}
                  >
                    <div className="pointer-events-auto relative h-full w-full min-h-0 min-w-0 overflow-visible">
                      <GuestTableSeatMap
                        capacity={table.capacity}
                        guests={table.guests}
                        tableAccent={tableStyle.accent}
                        selectedGuestId={selectedGuest?.id ?? null}
                        onSelectGuest={selectGuest}
                        suppressPointerEvents={dragging || transitionTransform}
                        showLogistics={false}
                        tableLabel={
                          <span
                            className={`block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[10px] font-semibold tracking-wide ${
                              highlighted
                                ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]'
                                : 'text-neutral-900'
                            }`}
                          >
                            {table.name}
                          </span>
                        }
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {selectedGuest ? (
          <aside
            className="pointer-events-auto absolute bottom-3 left-3 right-3 z-30 mx-auto max-w-md rounded-2xl border border-white/80 bg-white/95 px-4 py-3.5 pr-12 backdrop-blur-sm transition-[box-shadow,opacity] duration-300"
            style={{
              boxShadow:
                selectedGuestVisual?.resultGlow ??
                '0 10px 28px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.06)',
            }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={clearSelectionAndResetView}
              className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 005.7 7.11L10.59 12 5.7 16.89a1 1 0 101.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z"
                />
              </svg>
            </button>
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
                <div className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-black">
                  <MapTableGlyph color={selectedGuestVisual?.accent ?? '#71717a'} />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-black">
                    {selectedGuest.table_name}
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
