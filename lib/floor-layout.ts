import { computeFourSideCounts, MAX_SEAT_MAP_CAPACITY } from '@/lib/seat-map-layout'

/** Venue floor plan grid dimensions (shared by admin builder + guest map). */
export const FLOOR_GRID_COLS = 32
export const FLOOR_GRID_ROWS = 24

export const FLOOR_DEFAULT_TABLE_SPAN = { w: 2, h: 1 } as const
export const FLOOR_DEFAULT_LANDMARK_SPAN = { w: 2, h: 2 } as const

/** Defaults when table layout fields are absent (admin builder + guest map). */
export const FLOOR_TABLE_LAYOUT_DEFAULTS = {
  grid_x: 0,
  grid_y: 0,
  width_units: 2,
  height_units: 1,
} as const

export type FloorGridRect = {
  grid_x: number
  grid_y: number
  width_units: number
  height_units: number
}

export const VENUE_LANDMARK_KINDS = [
  { id: 'bar', label: 'Bar' },
  { id: 'toilets', label: 'Toilets' },
  { id: 'stage', label: 'Stage' },
  { id: 'balcony', label: 'Balcony' },
  { id: 'lifts', label: 'Lifts' },
  { id: 'other', label: 'Other' },
] as const

export type VenueLandmarkKind = (typeof VENUE_LANDMARK_KINDS)[number]['id']

export const VENUE_LANDMARK_SHAPES = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'circle', label: 'Circle' },
  { id: 'pill', label: 'Pill' },
] as const

export type VenueLandmarkShape = (typeof VENUE_LANDMARK_SHAPES)[number]['id']

export const VENUE_LANDMARK_COLOR_PRESETS = [
  '#ffffff',
  '#f4f4f5',
  '#dbeafe',
  '#dcfce7',
  '#fef3c7',
  '#fce7f3',
  '#e4e4e7',
  '#1e293b',
  '#7c3aed',
  '#f75f0c',
] as const

export function normalizeLandmarkShape(value: unknown): VenueLandmarkShape {
  if (value === 'circle' || value === 'pill' || value === 'rectangle') return value
  return 'rectangle'
}

export function landmarkBorderRadius(shape: string): string {
  switch (shape) {
    case 'circle':
      return '50%'
    case 'pill':
      return '9999px'
    default:
      return '0.75rem'
  }
}

export const VENUE_LANDMARK_ROTATIONS = [0, 90, 180, 270] as const
export type VenueLandmarkRotation = (typeof VENUE_LANDMARK_ROTATIONS)[number]

export function normalizeLandmarkRotation(value: unknown): VenueLandmarkRotation {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0
  if (n === 90 || n === 180 || n === 270) return n
  return 0
}

/** CSS writing mode for sideways landmark labels (avoids rotated bounding boxes). */
export function landmarkLabelStyle(rotation: VenueLandmarkRotation): {
  writingMode?: 'vertical-rl' | 'vertical-lr'
  textOrientation?: 'mixed'
  transform?: string
} {
  if (rotation === 0) return {}
  if (rotation === 90) {
    return { writingMode: 'vertical-rl', textOrientation: 'mixed' }
  }
  if (rotation === 180) {
    return { transform: 'rotate(180deg)' }
  }
  return { writingMode: 'vertical-lr', textOrientation: 'mixed' }
}

function clampLineDelta(value: number | undefined, maxAbs: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maxAbs, Math.max(-maxAbs, Math.trunc(value!)))
}

/** Line landmarks: grid_x/grid_y = start; width/height = signed end offset (any angle). */
export function normalizeLandmarkLineRect(rect: Partial<FloorGridRect>): FloorGridRect {
  const grid_x = clampGridCoord(rect.grid_x ?? 0, 1, FLOOR_GRID_COLS)
  const grid_y = clampGridCoord(rect.grid_y ?? 0, 1, FLOOR_GRID_ROWS)
  return {
    grid_x,
    grid_y,
    width_units: clampLineDelta(rect.width_units, FLOOR_GRID_COLS, 4),
    height_units: clampLineDelta(rect.height_units, FLOOR_GRID_ROWS, 4),
  }
}

/** Grid-space line endpoints for architectural overlays (percent 0–100). */
export function landmarkLineEndpoints(rect: FloorGridRect): {
  x1: number
  y1: number
  x2: number
  y2: number
} {
  const x1 = (rect.grid_x / FLOOR_GRID_COLS) * 100
  const y1 = (rect.grid_y / FLOOR_GRID_ROWS) * 100
  const x2 = ((rect.grid_x + rect.width_units) / FLOOR_GRID_COLS) * 100
  const y2 = ((rect.grid_y + rect.height_units) / FLOOR_GRID_ROWS) * 100
  return { x1, y1, x2, y2 }
}

export function clampGridSpan(value: number, min = 1, max = FLOOR_GRID_COLS): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function clampGridCoord(value: number, span: number, maxCells: number): number {
  const s = clampGridSpan(span, 1, maxCells)
  const maxStart = Math.max(0, maxCells - s)
  if (!Number.isFinite(value)) return 0
  return Math.min(maxStart, Math.max(0, Math.trunc(value)))
}

export function normalizeFloorRect(
  rect: Partial<FloorGridRect>,
  defaults: { w: number; h: number } = FLOOR_DEFAULT_TABLE_SPAN
): FloorGridRect {
  const width_units = clampGridSpan(rect.width_units ?? defaults.w, 1, FLOOR_GRID_COLS)
  const height_units = clampGridSpan(rect.height_units ?? defaults.h, 1, FLOOR_GRID_ROWS)
  return {
    grid_x: clampGridCoord(rect.grid_x ?? FLOOR_TABLE_LAYOUT_DEFAULTS.grid_x, width_units, FLOOR_GRID_COLS),
    grid_y: clampGridCoord(rect.grid_y ?? FLOOR_TABLE_LAYOUT_DEFAULTS.grid_y, height_units, FLOOR_GRID_ROWS),
    width_units,
    height_units,
  }
}

/** Center of a grid rect as guest-map percentage (0–100). */
export function gridRectToPercent(rect: FloorGridRect): { x: number; y: number } {
  return {
    x: ((rect.grid_x + rect.width_units / 2) / FLOOR_GRID_COLS) * 100,
    y: ((rect.grid_y + rect.height_units / 2) / FLOOR_GRID_ROWS) * 100,
  }
}

/** Top-left anchored rect as guest-map percentage bounds (0–100). */
export function gridRectToPercentBounds(rect: FloorGridRect): {
  left: number
  top: number
  width: number
  height: number
} {
  return {
    left: (rect.grid_x / FLOOR_GRID_COLS) * 100,
    top: (rect.grid_y / FLOOR_GRID_ROWS) * 100,
    width: (rect.width_units / FLOOR_GRID_COLS) * 100,
    height: (rect.height_units / FLOOR_GRID_ROWS) * 100,
  }
}

/** Snap a percentage center point to the nearest grid cell origin. */
export function percentCenterToGridRect(
  xPct: number,
  yPct: number,
  span: { w: number; h: number }
): FloorGridRect {
  const cx = (xPct / 100) * FLOOR_GRID_COLS
  const cy = (yPct / 100) * FLOOR_GRID_ROWS
  const width_units = clampGridSpan(span.w, 1, FLOOR_GRID_COLS)
  const height_units = clampGridSpan(span.h, 1, FLOOR_GRID_ROWS)
  return normalizeFloorRect(
    {
      grid_x: Math.round(cx - width_units / 2),
      grid_y: Math.round(cy - height_units / 2),
      width_units,
      height_units,
    },
    span
  )
}

export function rectsOverlap(a: FloorGridRect, b: FloorGridRect): boolean {
  return !(
    a.grid_x + a.width_units <= b.grid_x ||
    b.grid_x + b.width_units <= a.grid_x ||
    a.grid_y + a.height_units <= b.grid_y ||
    b.grid_y + b.height_units <= a.grid_y
  )
}

/** Ideal grid footprint for a table based on seat count (guest map + admin defaults). */
export function tableGridUnitsForCapacity(capacity: number): Pick<
  FloorGridRect,
  'width_units' | 'height_units'
> {
  const cap = Math.max(1, Math.min(MAX_SEAT_MAP_CAPACITY, Math.trunc(capacity)))
  const { topCount, bottomCount, leftEndSeat } = computeFourSideCounts(cap)
  const maxRow = Math.max(topCount, bottomCount, cap === 1 ? 1 : 0)
  const width_units = clampGridSpan(
    3 + Math.ceil(maxRow * 0.55) + (leftEndSeat != null ? 1 : 0),
    3,
    14
  )
  const dualRow = topCount > 0 && bottomCount > 0
  const height_units = clampGridSpan(dualRow ? 3 : 2, 2, 5)
  return { width_units, height_units }
}

/** Use capacity-based span when DB still has generic factory defaults. */
export function resolveTableGridUnits(
  capacity: number,
  stored?: Partial<FloorGridRect>
): Pick<FloorGridRect, 'width_units' | 'height_units'> {
  const fromCapacity = tableGridUnitsForCapacity(capacity)
  const w = stored?.width_units
  const h = stored?.height_units
  const isGenericDefault =
    w == null ||
    h == null ||
    (w === 5 && h === 3) ||
    (w === FLOOR_TABLE_LAYOUT_DEFAULTS.width_units &&
      h === FLOOR_TABLE_LAYOUT_DEFAULTS.height_units)
  if (isGenericDefault) return fromCapacity
  return {
    width_units: clampGridSpan(w, 1, FLOOR_GRID_COLS),
    height_units: clampGridSpan(h, 1, FLOOR_GRID_ROWS),
  }
}
