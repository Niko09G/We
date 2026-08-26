'use client'

import type {
  CSSProperties,
  InputHTMLAttributes,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  Ref,
  WheelEvent as ReactWheelEvent,
} from 'react'
import {
  FLOOR_GRID_COLS,
  FLOOR_GRID_ROWS,
  landmarkBorderRadius,
  landmarkLabelStyle,
  landmarkLineEndpoints,
  type VenueLandmarkRotation,
  type VenueLandmarkShape,
} from '@/lib/floor-layout'
import {
  dietaryBadgeClass,
  guestHasDietaryRestrictions,
  normalizeDietaryRestrictions,
} from '@/lib/guest-logistics'
import {
  SEAT_MAP_WORLD_HEIGHT,
  SEAT_MAP_WORLD_WIDTH,
} from '@/lib/seat-map-constants'

export { SEAT_MAP_WORLD_HEIGHT, SEAT_MAP_WORLD_WIDTH } from '@/lib/seat-map-constants'

/** Pan/zoom limits aligned with the guest seating map viewport. */
export const SEAT_MAP_ZOOM_MIN = 0.35
export const SEAT_MAP_ZOOM_STEP = 0.08
export const SEAT_MAP_ZOOM_DEFAULT = SEAT_MAP_ZOOM_MIN + SEAT_MAP_ZOOM_STEP
export const SEAT_MAP_ZOOM_MAX = 2.75
/** Slightly higher default zoom for internal catering / logistics scanning. */
export const SEAT_MAP_ZOOM_CATERING =
  SEAT_MAP_ZOOM_DEFAULT + SEAT_MAP_ZOOM_STEP * 2

export type SeatMapGuestLogistics = {
  dietary_restrictions?: string[] | null
  needs_baby_chair?: boolean
  needs_kids_menu?: boolean
}

type SeatLogisticsBadgesProps = SeatMapGuestLogistics & {
  showLogistics: boolean
  /** Scale badge size relative to seat bubble (1 = default). */
  scale?: number
}

/** Mini overlays for allergies, baby chair, and kids menu on seat avatars. */
export function SeatLogisticsBadges({
  showLogistics,
  dietary_restrictions,
  needs_baby_chair,
  needs_kids_menu,
  scale = 1,
}: SeatLogisticsBadgesProps) {
  if (!showLogistics) return null

  const allergies = normalizeDietaryRestrictions(dietary_restrictions)
  const hasAllergies = allergies.length > 0
  const babyChair = Boolean(needs_baby_chair)
  const kidsMenu = Boolean(needs_kids_menu)
  if (!hasAllergies && !babyChair && !kidsMenu) return null

  const dot = Math.max(7, Math.round(8 * scale))
  const icon = Math.max(10, Math.round(11 * scale))
  const allergyTitle = hasAllergies ? `Allergies: ${allergies.join(', ')}` : undefined

  return (
    <>
      {hasAllergies ? (
        <span
          className="pointer-events-none absolute left-0 top-0 z-[2] rounded-full border border-white bg-red-500 shadow-sm"
          style={{ width: dot, height: dot }}
          title={allergyTitle}
          aria-label={allergyTitle}
        />
      ) : null}
      {babyChair ? (
        <span
          className="pointer-events-none absolute bottom-0 left-0 z-[2] flex items-center justify-center rounded-full border border-white bg-amber-100 text-amber-900 shadow-sm"
          style={{ width: icon, height: icon, fontSize: Math.max(7, Math.round(7 * scale)) }}
          title="Baby chair"
          aria-label="Baby chair"
        >
          🪑
        </span>
      ) : null}
      {kidsMenu ? (
        <span
          className="pointer-events-none absolute bottom-0 right-0 z-[2] flex items-center justify-center rounded-full border border-white bg-sky-100 text-sky-900 shadow-sm"
          style={{ width: icon, height: icon, fontSize: Math.max(7, Math.round(7 * scale)) }}
          title="Kids menu"
          aria-label="Kids menu"
        >
          🧒
        </span>
      ) : null}
    </>
  )
}

export function seatMapGuestHasLogistics(guest: SeatMapGuestLogistics): boolean {
  return (
    guestHasDietaryRestrictions(guest.dietary_restrictions) ||
    Boolean(guest.needs_baby_chair) ||
    Boolean(guest.needs_kids_menu)
  )
}

export type SeatMapLogisticsFilters = {
  allergies: boolean
  babyChair: boolean
  kidsMenu: boolean
}

export const SEAT_MAP_LOGISTICS_FILTERS_DEFAULT: SeatMapLogisticsFilters = {
  allergies: true,
  babyChair: true,
  kidsMenu: true,
}

type SeatLogisticsCalloutsProps = SeatMapGuestLogistics & {
  filters: SeatMapLogisticsFilters
}

/** Floating speech bubbles for catering / logistics map overlays. */
export function SeatLogisticsCallouts({
  filters,
  dietary_restrictions,
  needs_baby_chair,
  needs_kids_menu,
}: SeatLogisticsCalloutsProps) {
  const allergies = normalizeDietaryRestrictions(dietary_restrictions)
  const showAllergies = filters.allergies && allergies.length > 0
  const showBabyChair = filters.babyChair && Boolean(needs_baby_chair)
  const showKidsMenu = filters.kidsMenu && Boolean(needs_kids_menu)
  if (!showAllergies && !showBabyChair && !showKidsMenu) return null

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-[8] mb-1 w-max max-w-[min(128px,30vw)] -translate-x-1/2">
      <div className="relative rounded-lg border border-zinc-200/90 bg-white px-1.5 py-1 shadow-[0_4px_14px_rgba(0,0,0,0.12)]">
        <div className="flex flex-col items-center gap-0.5">
          {showAllergies ? (
            <div className="flex max-w-full flex-wrap items-center justify-center gap-0.5">
              {allergies.map((item) => (
                <span
                  key={item}
                  className={`inline-flex max-w-full truncate rounded-full border px-1.5 py-px text-[9px] font-semibold ${dietaryBadgeClass(item)}`}
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          {showBabyChair ? (
            <span className="whitespace-nowrap text-[9px] font-semibold text-zinc-800">
              🪑 Baby Chair
            </span>
          ) : null}
          {showKidsMenu ? (
            <span className="whitespace-nowrap text-[9px] font-semibold text-zinc-800">
              🧒 Kids Menu
            </span>
          ) : null}
        </div>
        <div
          className="absolute left-1/2 top-full -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-white"
          aria-hidden
        />
        <div
          className="absolute left-1/2 top-full mt-px -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-zinc-200/90"
          style={{ zIndex: -1 }}
          aria-hidden
        />
      </div>
    </div>
  )
}

/** Inset padding when clamping pan so the canvas edge cannot scroll past the viewport. */
export const SEAT_MAP_PAN_PADDING = 0
/** Allow panning past the map edge by this fraction of the viewport (centers edge tables). */
export const SEAT_MAP_PAN_OVERSCROLL_RATIO = 0.3

export type SeatMapPan = { x: number; y: number }

/** Allow horizontal map pan while letting vertical swipes scroll the page. */
export const SEAT_MAP_VIEWPORT_TOUCH_ACTION = 'pan-x'

export type SeatMapPointerDragState = {
  sx: number
  sy: number
  px: number
  py: number
}

export type SeatMapPointerHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
  onWheel: (e: ReactWheelEvent<HTMLElement>) => void
}

type CreateSeatMapPointerHandlersArgs = {
  pan: SeatMapPan
  zoom: number
  dragging: boolean
  setDragging: (v: boolean) => void
  setPan: (pan: SeatMapPan) => void
  dragRef: MutableRefObject<SeatMapPointerDragState | null>
  dragMovedRef: MutableRefObject<boolean>
  pendingDragRef: MutableRefObject<SeatMapPointerDragState | null>
  applyBoundedTransform: (
    pan: SeatMapPan,
    zoom: number
  ) => { pan: SeatMapPan; zoom: number }
  setTransitionTransform: (v: boolean) => void
  onNeutralBackdropTap?: (e: ReactPointerEvent<HTMLElement>) => void
}

/**
 * Pan the map horizontally only; vertical movement passes through to page scroll.
 */
export function createSeatMapPointerHandlers({
  pan,
  zoom,
  dragging,
  setDragging,
  setPan,
  dragRef,
  dragMovedRef,
  pendingDragRef,
  applyBoundedTransform,
  setTransitionTransform,
  onNeutralBackdropTap,
}: CreateSeatMapPointerHandlersArgs): SeatMapPointerHandlers {
  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragging && !dragMovedRef.current && onNeutralBackdropTap) {
      onNeutralBackdropTap(e)
    }
    if (dragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    setDragging(false)
    dragRef.current = null
    pendingDragRef.current = null
  }

  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      const t = e.target as HTMLElement
      if (t.closest('button')) return
      dragMovedRef.current = false
      setTransitionTransform(false)
      pendingDragRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        px: pan.x,
        py: pan.y,
      }
    },
    onPointerMove: (e) => {
      const pending = pendingDragRef.current
      if (!dragging && !pending) return

      if (!dragging && pending) {
        const dx = e.clientX - pending.sx
        const dy = e.clientY - pending.sy
        if (Math.hypot(dx, dy) <= 4) return
        if (Math.abs(dy) > Math.abs(dx)) {
          pendingDragRef.current = null
          return
        }
        setDragging(true)
        dragRef.current = pending
        pendingDragRef.current = null
        e.currentTarget.setPointerCapture(e.pointerId)
      }

      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.sx
      if (Math.abs(dx) > 4) dragMovedRef.current = true
      const bounded = applyBoundedTransform(
        { x: d.px + dx, y: d.py },
        zoom
      )
      setPan(bounded.pan)
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onWheel: (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      const bounded = applyBoundedTransform(
        { x: pan.x - e.deltaX, y: pan.y },
        zoom
      )
      setPan(bounded.pan)
    },
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Clamp zoom to configured min/max (same as layout builder guest preview). */
export function clampSeatMapZoom(zoom: number): number {
  return clamp(zoom, SEAT_MAP_ZOOM_MIN, SEAT_MAP_ZOOM_MAX)
}

/**
 * Keep pan within the map canvas — equivalent to limitToBounds on a transform component.
 * When the scaled world is smaller than the viewport, pan locks to center.
 */
export function clampSeatMapPan(
  pan: SeatMapPan,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  padding = SEAT_MAP_PAN_PADDING,
  overscrollRatio = SEAT_MAP_PAN_OVERSCROLL_RATIO
): SeatMapPan {
  const scaledW = SEAT_MAP_WORLD_WIDTH * zoom
  const scaledH = SEAT_MAP_WORLD_HEIGHT * zoom
  const overscrollX = viewportWidth * overscrollRatio
  const overscrollY = viewportHeight * overscrollRatio

  let minX: number
  let maxX: number
  if (scaledW <= viewportWidth) {
    const cx = (viewportWidth - scaledW) / 2
    minX = maxX = cx
  } else {
    minX = viewportWidth - scaledW - padding - overscrollX
    maxX = padding + overscrollX
  }

  let minY: number
  let maxY: number
  if (scaledH <= viewportHeight) {
    const cy = (viewportHeight - scaledH) / 2
    minY = maxY = cy
  } else {
    minY = viewportHeight - scaledH - padding - overscrollY
    maxY = padding + overscrollY
  }

  return {
    x: clamp(pan.x, minX, maxX),
    y: clamp(pan.y, minY, maxY),
  }
}

export function clampSeatMapTransform(
  pan: SeatMapPan,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = SEAT_MAP_PAN_PADDING
): { pan: SeatMapPan; zoom: number } {
  const z = clampSeatMapZoom(zoom)
  return {
    zoom: z,
    pan: clampSeatMapPan(pan, viewportWidth, viewportHeight, z, padding),
  }
}

export type SeatMapLandmark = {
  id: string
  name: string
  shape: VenueLandmarkShape
  color: string | null
  left: number
  top: number
  width: number
  height: number
  rotation?: VenueLandmarkRotation
  is_line?: boolean
  grid_x?: number
  grid_y?: number
  width_units?: number
  height_units?: number
}

type SeatMapSearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'placeholder'
> & {
  inputRef?: Ref<HTMLInputElement>
  accentCssVar?: CSSProperties
  className?: string
}

/** Gemini-style rotating gradient ring around the guest map search capsule. */
export function SeatMapSearchInput({
  inputRef,
  accentCssVar,
  className = '',
  ...inputProps
}: SeatMapSearchInputProps) {
  return (
    <div
      className={`seat-map-search-shell relative rounded-full ${className}`}
      style={accentCssVar}
    >
      <div className="relative z-[1] rounded-full bg-[#ffffff]">
        <input
          ref={inputRef}
          placeholder="Search name"
          className={`relative z-10 w-full rounded-full border-0 bg-zinc-50/90 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors duration-200 focus:bg-white ${
            accentCssVar
              ? 'focus:ring-2 focus:ring-[color-mix(in_srgb,var(--viewer-accent)_28%,transparent)]'
              : 'focus:ring-2 focus:ring-violet-200/60'
          }`}
          {...inputProps}
        />
      </div>
    </div>
  )
}

function lineStrokeColor(color: string | null | undefined): string {
  const c = color?.trim()
  if (c && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) return c
  return '#a1a1aa'
}

type SeatMapLandmarksLayerProps = {
  landmarks: SeatMapLandmark[]
  /** Optional team accent for neutral architectural lines. */
  accentColor?: string | null
}

export function SeatMapLandmarksLayer({ landmarks, accentColor }: SeatMapLandmarksLayerProps) {
  const lineLandmarks = landmarks.filter((lm) => lm.is_line)
  const blockLandmarks = landmarks.filter((lm) => !lm.is_line)

  return (
    <>
      {lineLandmarks.length > 0 ? (
        <svg
          className="pointer-events-none absolute inset-0 z-[4] h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {lineLandmarks.map((lm) => {
            const rect =
              lm.grid_x != null &&
              lm.grid_y != null &&
              lm.width_units != null &&
              lm.height_units != null
                ? {
                    grid_x: lm.grid_x,
                    grid_y: lm.grid_y,
                    width_units: lm.width_units,
                    height_units: lm.height_units,
                  }
                : {
                    grid_x: Math.round((lm.left / 100) * FLOOR_GRID_COLS),
                    grid_y: Math.round((lm.top / 100) * FLOOR_GRID_ROWS),
                    width_units: Math.max(
                      1,
                      Math.round((lm.width / 100) * FLOOR_GRID_COLS)
                    ),
                    height_units: Math.max(
                      1,
                      Math.round((lm.height / 100) * FLOOR_GRID_ROWS)
                    ),
                  }
            const { x1, y1, x2, y2 } = landmarkLineEndpoints(rect)
            const stroke = lineStrokeColor(lm.color ?? accentColor)
            return (
              <line
                key={lm.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={4}
                strokeDasharray="6 6"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.92}
              />
            )
          })}
        </svg>
      ) : null}

      {blockLandmarks.map((lm) => {
        const rotation = lm.rotation ?? 0
        const labelStyle = landmarkLabelStyle(rotation)
        return (
          <div
            key={lm.id}
            className="absolute z-[5] box-border overflow-hidden border border-zinc-200/90 px-1.5 py-1 text-center text-[10px] font-medium tracking-wide text-zinc-600 shadow-sm"
            style={{
              left: `${lm.left}%`,
              top: `${lm.top}%`,
              width: `${lm.width}%`,
              height: `${lm.height}%`,
              backgroundColor: lm.color ?? '#ffffff',
              borderRadius: landmarkBorderRadius(lm.shape),
            }}
          >
            <span
              className="flex h-full w-full items-center justify-center leading-tight"
              style={labelStyle}
            >
              {lm.name}
            </span>
          </div>
        )
      })}
    </>
  )
}

export { SeatMap } from '@/components/SeatMapView'
export type { SeatMapGuest, SeatMapProps } from '@/components/SeatMapView'
