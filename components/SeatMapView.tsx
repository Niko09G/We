'use client'

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  computeFourSideCounts,
  guestTableSeatMapMetrics,
  MAX_SEAT_MAP_CAPACITY,
  seatSizingForRowWidthWithSideCounts,
  seatSizingForSideCounts,
} from '@/lib/seat-map-layout'
import { teamPageAdminFormDefaults } from '@/lib/team-page-config'
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
import {
  SeatLogisticsBadges,
  SeatMapLandmarksLayer,
  SEAT_MAP_WORLD_WIDTH,
  SEAT_MAP_WORLD_HEIGHT,
  SEAT_MAP_ZOOM_MIN,
  SEAT_MAP_ZOOM_STEP,
  SEAT_MAP_ZOOM_MAX,
  SEAT_MAP_ZOOM_CATERING,
  clampSeatMapTransform,
  createSeatMapPointerHandlers,
  SEAT_MAP_VIEWPORT_TOUCH_ACTION,
  type SeatMapGuestLogistics,
  type SeatMapLandmark,
} from '@/components/SeatMap'

export type SeatMapGuest = SeatMapGuestLogistics & {
  id: string
  full_name: string
  photo_url: string | null
  table_id: string
  seat_number: number
}

type SeatMapTable = {
  id: string
  name: string
  color: string | null
  capacity: number
  display_order: number
  page_config: unknown
  team_id: string
  grid_x: number | null
  grid_y: number | null
  width_units: number
  height_units: number
}

type TableVisual = {
  background: string
  borderColor: string
  shadow: string
  accent: string
}

type TableOnMap = {
  id: string
  name: string
  capacity: number
  display_order: number
  team_id: string
  guests: SeatMapGuest[]
  visual: TableVisual
  bounds: { left: number; top: number; width: number; height: number }
}

const MAP_SLOT_KEYS = ['gold', 'blue', 'red', 'green'] as const
type MapSlotKey = (typeof MAP_SLOT_KEYS)[number]

const TEAM_LANE_Y = [18, 35, 52, 69] as const
const MAP_CENTER_X = 50
const PAIR_XS = [28, 72] as const
const WORLD_W = SEAT_MAP_WORLD_WIDTH
const WORLD_H = SEAT_MAP_WORLD_HEIGHT
const TRANSFORM_MS = 280

const TABLE_GRADIENT_BY_SLOT: Record<MapSlotKey, string> = {
  gold: 'linear-gradient(to bottom, #f75f0c 0%, #fca16a 100%)',
  blue: 'linear-gradient(to bottom, #952dfe 0%, #5a35f9 50%, #889af9 100%)',
  red: 'linear-gradient(to bottom, #ff3b4a 0%, #ff997a 100%)',
  green: 'linear-gradient(to bottom, #0c8837 0%, #89c97d 100%)',
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return `${a}${b}`.toUpperCase() || 'G'
}

function spreadLaneXs(count: number): number[] {
  if (count <= 1) return [MAP_CENTER_X]
  if (count === 2) return [...PAIR_XS]
  const start = 22
  const end = 78
  return Array.from({ length: count }, (_, i) => start + ((end - start) * i) / Math.max(1, count - 1))
}

function boundsFromCenter(x: number, y: number, capacity: number) {
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

function tableVisualFromTeam(
  color: string | null,
  pageConfig: unknown,
  tableName: string,
  slotKey: MapSlotKey
): TableVisual {
  const d = teamPageAdminFormDefaults(pageConfig, { tableColor: color, tableName })
  const top = d.tableGradTop.trim()
  const bottom = d.tableGradBottom.trim()
  const accent = d.primaryColor.trim() || top || '#71717a'
  const background =
    top && bottom
      ? `linear-gradient(to bottom, ${top} 0%, ${bottom} 100%)`
      : TABLE_GRADIENT_BY_SLOT[slotKey]
  return {
    background,
    borderColor: 'rgba(255,255,255,0.28)',
    shadow: '0 6px 18px rgba(0,0,0,0.12)',
    accent,
  }
}

function SeatMapTableGuests({
  capacity,
  guests,
  showLogistics,
  tableLabel,
}: {
  capacity: number
  guests: SeatMapGuest[]
  showLogistics: boolean
  tableLabel: React.ReactNode
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
    const m = new Map<number, SeatMapGuest>()
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
        title={`${guest.full_name} · Seat ${guest.seat_number}`}
      >
        <div
          className="absolute left-1/2 top-1/2 overflow-hidden rounded-full border border-zinc-300/70"
          style={{
            width: size,
            height: size,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {guest.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={guest.photo_url}
              alt=""
              className="block h-full w-full rounded-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-700">
              {getInitials(guest.full_name)}
            </span>
          )}
        </div>
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
              <div className="pointer-events-none z-[3] -translate-y-1/2 overflow-visible">
                {renderSide(topStart, topEnd, topSizing)}
              </div>
            ) : null}
            <div className="flex h-6 w-full min-w-0 shrink-0 items-center justify-center overflow-hidden px-1">
              {tableLabel}
            </div>
            {bottomCount > 0 ? (
              <div className="pointer-events-none z-[3] translate-y-1/2 overflow-visible">
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

export type SeatMapProps = {
  showLogistics?: boolean
  defaultZoom?: number
  tables: SeatMapTable[]
  guests: SeatMapGuest[]
  landmarks?: SeatMapLandmark[]
  layoutSchemaReady?: boolean
  className?: string
}

export function SeatMap({
  showLogistics = false,
  defaultZoom = SEAT_MAP_ZOOM_CATERING,
  tables,
  guests,
  landmarks = [],
  layoutSchemaReady = true,
  className = '',
}: SeatMapProps) {
  const [zoom, setZoom] = useState(defaultZoom)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [transitionTransform, setTransitionTransform] = useState(false)
  const [dragging, setDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const mapFrameRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const pendingDragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const dragMovedRef = useRef(false)

  const applyBoundedTransform = useCallback(
    (nextPan: { x: number; y: number }, nextZoom: number) => {
      const vp = viewportRef.current
      if (!vp) return { pan: nextPan, zoom: nextZoom }
      return clampSeatMapTransform(nextPan, nextZoom, vp.clientWidth, vp.clientHeight)
    },
    []
  )

  const applyOverviewCamera = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const z = defaultZoom
    const { pan: bounded } = applyBoundedTransform(
      {
        x: (vp.clientWidth - WORLD_W * z) / 2,
        y: (vp.clientHeight - WORLD_H * z) / 2,
      },
      z
    )
    setZoom(z)
    setPan(bounded)
  }, [applyBoundedTransform, defaultZoom])

  useLayoutEffect(() => {
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
  }, [applyOverviewCamera, tables.length, guests.length])

  const tablesUsed = useMemo((): TableOnMap[] => {
    const guestByTable = new Map<string, SeatMapGuest[]>()
    for (const r of guests) {
      if (!guestByTable.has(r.table_id)) guestByTable.set(r.table_id, [])
      guestByTable.get(r.table_id)!.push(r)
    }

    const orderedTables = [...tables].sort((a, b) => {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

    const teams = [...groupTablesByTeamId(orderedTables).entries()].sort((a, b) => {
      const minOrd = (members: SeatMapTable[]) =>
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
      placed.push({
        id: meta.id,
        name: meta.name,
        capacity: meta.capacity,
        display_order: meta.display_order,
        team_id: teamId,
        guests: [...(guestByTable.get(meta.id) ?? [])].sort(
          (a, b) => a.seat_number - b.seat_number
        ),
        visual,
        bounds,
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

      sortedMembers.forEach((meta, i) => {
        placed.push({
          id: meta.id,
          name: meta.name,
          capacity: meta.capacity,
          display_order: meta.display_order,
          team_id: teamId,
          guests: [...(guestByTable.get(meta.id) ?? [])].sort(
            (a, b) => a.seat_number - b.seat_number
          ),
          visual,
          bounds: boundsFromCenter(xs[i] ?? MAP_CENTER_X, y, meta.capacity),
        })
      })
    })

    return placed
  }, [guests, tables, layoutSchemaReady])

  const setZoomAnchored = (next: number) => {
    const el = viewportRef.current
    if (!el) return
    const z = Math.min(SEAT_MAP_ZOOM_MAX, Math.max(SEAT_MAP_ZOOM_MIN, next))
    const Vcx = el.clientWidth / 2
    const Vcy = el.clientHeight / 2
    const worldX = (Vcx - pan.x) / zoom
    const worldY = (Vcy - pan.y) / zoom
    const bounded = applyBoundedTransform(
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
    applyBoundedTransform,
    setTransitionTransform,
  })

  return (
    <div
      ref={mapFrameRef}
      className={`relative aspect-[4/3] w-full min-h-[min(72vh,720px)] overflow-hidden rounded-2xl border border-[#ebebeb] bg-zinc-50/90 ${className}`}
    >
      <div
        className="absolute right-3 top-3 z-20 flex flex-col gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoomAnchored(zoom + SEAT_MAP_ZOOM_STEP)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-950 bg-zinc-900 text-lg font-semibold leading-none text-white shadow-sm"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoomAnchored(zoom - SEAT_MAP_ZOOM_STEP)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-950 bg-zinc-900 text-lg font-semibold leading-none text-white shadow-sm"
        >
          −
        </button>
      </div>

      <div
        ref={viewportRef}
        role="application"
        aria-label="Catering logistics map"
        className="relative h-full w-full cursor-grab select-none active:cursor-grabbing [touch-action:pan-x]"
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
          <SeatMapLandmarksLayer landmarks={landmarks} />
          {tablesUsed.map((table) => (
            <div
              key={table.id}
              data-seat-map-table
              className="absolute z-[6] box-border overflow-visible"
              style={{
                left: `${table.bounds.left}%`,
                top: `${table.bounds.top}%`,
                width: `${table.bounds.width}%`,
                height: `${table.bounds.height}%`,
                minWidth: 0,
                minHeight: 0,
              }}
            >
              <div
                className="pointer-events-none relative box-border flex h-full w-full min-h-0 min-w-0 flex-col overflow-visible rounded-2xl border border-neutral-200/80 bg-white shadow-[0_6px_18px_rgba(0,0,0,0.12)]"
                style={{
                  background: table.visual.background,
                  borderColor: table.visual.borderColor,
                  boxShadow: table.visual.shadow,
                }}
              >
                <div className="pointer-events-none relative h-full w-full min-h-0 min-w-0 overflow-visible">
                  <SeatMapTableGuests
                    capacity={table.capacity}
                    guests={table.guests}
                    showLogistics={showLogistics}
                    tableLabel={
                      <span className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[10px] font-semibold tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                        {table.name}
                      </span>
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { SeatMapTable }
