import { supabase } from '@/lib/supabase/client'
import {
  FLOOR_DEFAULT_LANDMARK_SPAN,
  FLOOR_DEFAULT_TABLE_SPAN,
  normalizeFloorRect,
  normalizeLandmarkLineRect,
  normalizeLandmarkRotation,
  normalizeLandmarkShape,
  resolveTableGridUnits,
  type FloorGridRect,
  type VenueLandmarkKind,
  type VenueLandmarkRotation,
  type VenueLandmarkShape,
} from '@/lib/floor-layout'
import { resolveTeamId } from '@/lib/table-teams'

export type FloorLayoutTable = {
  id: string
  name: string
  color: string | null
  capacity: number
  display_order: number
  is_active: boolean
  is_archived: boolean
  team_id: string
  grid_x: number
  grid_y: number
  width_units: number
  height_units: number
}

export type VenueLandmarkRow = {
  id: string
  label: string
  kind: VenueLandmarkKind | string
  grid_x: number
  grid_y: number
  width_units: number
  height_units: number
  shape: VenueLandmarkShape
  color: string | null
  sort_order: number
  rotation: VenueLandmarkRotation
  is_line: boolean
}

export type FloorLayoutLoadResult = {
  tables: FloorLayoutTable[]
  landmarks: VenueLandmarkRow[]
  /** True when `tables` includes persisted grid columns from the database. */
  layoutSchemaReady: boolean
}

function finiteInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function isMissingSchemaError(message: string, hints: RegExp[]): boolean {
  const m = message.toLowerCase()
  return hints.some((re) => re.test(m))
}

function readGridSpan(row: Record<string, unknown>, axis: 'w' | 'h'): number | undefined {
  const primary = axis === 'w' ? row.width_units : row.height_units
  const legacy = axis === 'w' ? row.grid_span_w : row.grid_span_h
  return finiteInt(primary) ?? finiteInt(legacy)
}

function tableLayoutFromRow(row: Record<string, unknown>): Pick<
  FloorLayoutTable,
  'grid_x' | 'grid_y' | 'width_units' | 'height_units'
> {
  const cap = row.capacity
  const capacity =
    typeof cap === 'number' && Number.isFinite(cap) && cap >= 1 ? Math.trunc(cap) : 10
  const units = resolveTableGridUnits(capacity, {
    width_units: readGridSpan(row, 'w'),
    height_units: readGridSpan(row, 'h'),
  })
  return normalizeFloorRect(
    {
      grid_x: finiteInt(row.grid_x),
      grid_y: finiteInt(row.grid_y),
      width_units: units.width_units,
      height_units: units.height_units,
    },
    { w: units.width_units, h: units.height_units }
  )
}

function parseTableRow(row: Record<string, unknown>): FloorLayoutTable {
  const cap = row.capacity
  const ord = row.display_order
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    color: (row.color as string | null) ?? null,
    capacity:
      typeof cap === 'number' && Number.isFinite(cap) && cap >= 1 ? Math.trunc(cap) : 10,
    display_order: typeof ord === 'number' && Number.isFinite(ord) ? Math.trunc(ord) : 0,
    is_active: (row.is_active as boolean | undefined) ?? true,
    is_archived: (row.is_archived as boolean | undefined) ?? false,
    team_id: resolveTeamId({
      id: row.id as string,
      team_id: (row.team_id as string | null | undefined) ?? null,
    }),
    ...tableLayoutFromRow(row),
  }
}

function resolveLandmarkKind(row: Record<string, unknown>): string {
  const raw = row.kind ?? row.type ?? row.category
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return 'other'
}

function parseLandmarkRow(row: Record<string, unknown>): VenueLandmarkRow {
  const isLine = Boolean(row.is_line)
  const rect = isLine
    ? normalizeLandmarkLineRect({
        grid_x: finiteInt(row.grid_x),
        grid_y: finiteInt(row.grid_y),
        width_units: finiteInt(row.width_units),
        height_units: finiteInt(row.height_units),
      })
    : normalizeFloorRect(
        {
          grid_x: finiteInt(row.grid_x),
          grid_y: finiteInt(row.grid_y),
          width_units: finiteInt(row.width_units),
          height_units: finiteInt(row.height_units),
        },
        FLOOR_DEFAULT_LANDMARK_SPAN
      )
  const colorRaw = row.color
  return {
    id: row.id as string,
    label: (row.label as string) ?? '',
    kind: resolveLandmarkKind(row),
    sort_order: finiteInt(row.sort_order) ?? 0,
    shape: normalizeLandmarkShape(row.shape),
    color: typeof colorRaw === 'string' && colorRaw.trim() ? colorRaw.trim() : null,
    rotation: normalizeLandmarkRotation(row.rotation),
    is_line: Boolean(row.is_line),
    ...rect,
  }
}

const LANDMARK_SELECT =
  'id, label, kind, grid_x, grid_y, width_units, height_units, shape, color, sort_order, rotation, is_line'

const LANDMARK_SELECT_NO_KIND =
  'id, label, grid_x, grid_y, width_units, height_units, shape, color, sort_order, rotation, is_line'

const LANDMARK_SELECT_LEGACY =
  'id, label, kind, grid_x, grid_y, width_units, height_units, shape, color, sort_order'

const LANDMARK_SELECT_LEGACY_NO_KIND =
  'id, label, grid_x, grid_y, width_units, height_units, shape, color, sort_order'

const TABLE_GRID_SELECT =
  'id, name, color, capacity, display_order, is_active, is_archived, team_id, grid_x, grid_y, width_units, height_units'

const TABLE_GRID_SELECT_LEGACY =
  'id, name, color, capacity, display_order, is_active, is_archived, team_id, grid_x, grid_y, grid_span_w, grid_span_h'

const TABLE_BASE_SELECT =
  'id, name, color, capacity, display_order, is_active, is_archived, team_id'

async function fetchFloorLayoutTables(): Promise<{
  tables: FloorLayoutTable[]
  layoutSchemaReady: boolean
}> {
  const withGrid = await supabase
    .from('tables')
    .select(TABLE_GRID_SELECT)
    .order('display_order')
    .order('name')

  if (!withGrid.error) {
    return {
      layoutSchemaReady: true,
      tables: (withGrid.data ?? [])
        .map((row) => parseTableRow(row as Record<string, unknown>))
        .filter((t) => !t.is_archived),
    }
  }

  if (
    isMissingSchemaError(withGrid.error.message, [
      /grid_/i,
      /width_units/i,
      /height_units/i,
      /grid_span/i,
      /column/i,
      /does not exist/i,
      /schema cache/i,
    ])
  ) {
    const legacyGrid = await supabase
      .from('tables')
      .select(TABLE_GRID_SELECT_LEGACY)
      .order('display_order')
      .order('name')
    if (!legacyGrid.error) {
      return {
        layoutSchemaReady: true,
        tables: (legacyGrid.data ?? [])
          .map((row) => parseTableRow(row as Record<string, unknown>))
          .filter((t) => !t.is_archived),
      }
    }

    const fallback = await supabase
      .from('tables')
      .select(TABLE_BASE_SELECT)
      .order('display_order')
      .order('name')
    if (fallback.error) throw new Error(fallback.error.message || 'Failed to load tables for floor plan.')
    return {
      layoutSchemaReady: false,
      tables: (fallback.data ?? [])
        .map((row) => parseTableRow(row as Record<string, unknown>))
        .filter((t) => !t.is_archived),
    }
  }

  throw new Error(withGrid.error.message || 'Failed to load tables for floor plan.')
}

async function fetchVenueLandmarks(): Promise<VenueLandmarkRow[]> {
  const primary = await supabase
    .from('venue_landmarks')
    .select(LANDMARK_SELECT)
    .order('sort_order')
    .order('label')

  if (!primary.error) {
    return (primary.data ?? []).map((row) => parseLandmarkRow(row as Record<string, unknown>))
  }

  if (
    isMissingSchemaError(primary.error.message, [
      /rotation/i,
      /is_line/i,
      /column/i,
      /schema cache/i,
    ])
  ) {
    const legacy = await supabase
      .from('venue_landmarks')
      .select(LANDMARK_SELECT_LEGACY)
      .order('sort_order')
      .order('label')
    if (!legacy.error) {
      return (legacy.data ?? []).map((row) => parseLandmarkRow(row as Record<string, unknown>))
    }
  }

  if (
    isMissingSchemaError(primary.error.message, [
      /kind/i,
      /column/i,
      /schema cache/i,
    ])
  ) {
    const fallback = await supabase
      .from('venue_landmarks')
      .select(LANDMARK_SELECT_NO_KIND)
      .order('sort_order')
      .order('label')
    if (!fallback.error) {
      return (fallback.data ?? []).map((row) => parseLandmarkRow(row as Record<string, unknown>))
    }
    const legacyNoKind = await supabase
      .from('venue_landmarks')
      .select(LANDMARK_SELECT_LEGACY_NO_KIND)
      .order('sort_order')
      .order('label')
    if (!legacyNoKind.error) {
      return (legacyNoKind.data ?? []).map((row) => parseLandmarkRow(row as Record<string, unknown>))
    }
  }

  if (
    isMissingSchemaError(primary.error.message, [
      /venue_landmarks/i,
      /relation/i,
      /does not exist/i,
    ])
  ) {
    return []
  }

  throw new Error(primary.error.message || 'Failed to load venue landmarks.')
}

export async function loadAdminFloorLayout(): Promise<FloorLayoutLoadResult> {
  const { tables, layoutSchemaReady } = await fetchFloorLayoutTables()
  const landmarks = await fetchVenueLandmarks()

  tables.sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return { tables, landmarks, layoutSchemaReady }
}

export async function listFloorLayoutTables(): Promise<FloorLayoutTable[]> {
  const { tables } = await loadAdminFloorLayout()
  return tables
}

export async function listVenueLandmarks(): Promise<VenueLandmarkRow[]> {
  const { landmarks } = await loadAdminFloorLayout()
  return landmarks
}

export async function saveFloorLayoutTables(
  updates: Array<{ id: string } & FloorGridRect>
): Promise<void> {
  const results = await Promise.all(
    updates.map(async ({ id, ...rect }) => {
      const normalized = normalizeFloorRect(rect, FLOOR_DEFAULT_TABLE_SPAN)
      const payload = {
        grid_x: normalized.grid_x,
        grid_y: normalized.grid_y,
        width_units: normalized.width_units,
        height_units: normalized.height_units,
      }
      const primary = await supabase.from('tables').update(payload).eq('id', id)
      if (!primary.error) return primary

      if (
        isMissingSchemaError(primary.error.message, [
          /width_units/i,
          /height_units/i,
          /schema cache/i,
          /column/i,
        ])
      ) {
        return supabase
          .from('tables')
          .update({
            grid_x: normalized.grid_x,
            grid_y: normalized.grid_y,
            grid_span_w: normalized.width_units,
            grid_span_h: normalized.height_units,
          })
          .eq('id', id)
      }

      return primary
    })
  )

  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message || 'Failed to save table layout.')
}

function landmarkPayload(
  input: Partial<VenueLandmarkRow> & { label: string },
  rect: FloorGridRect,
  includeKind: boolean
) {
  const base = {
    label: input.label.trim(),
    grid_x: rect.grid_x,
    grid_y: rect.grid_y,
    width_units: rect.width_units,
    height_units: rect.height_units,
    shape: normalizeLandmarkShape(input.shape),
    color: input.color?.trim() || null,
    sort_order:
      input.sort_order != null && Number.isFinite(input.sort_order)
        ? Math.trunc(input.sort_order)
        : 0,
    rotation: normalizeLandmarkRotation(input.rotation),
    is_line: Boolean(input.is_line),
  }
  if (!includeKind) return base
  return {
    ...base,
    kind: resolveLandmarkKind(input as Record<string, unknown>),
  }
}

function landmarkPayloadWithoutRotationLine(
  input: Partial<VenueLandmarkRow> & { label: string },
  rect: FloorGridRect,
  includeKind: boolean
) {
  const base = {
    label: input.label.trim(),
    grid_x: rect.grid_x,
    grid_y: rect.grid_y,
    width_units: rect.width_units,
    height_units: rect.height_units,
    shape: normalizeLandmarkShape(input.shape),
    color: input.color?.trim() || null,
    sort_order:
      input.sort_order != null && Number.isFinite(input.sort_order)
        ? Math.trunc(input.sort_order)
        : 0,
  }
  if (!includeKind) return base
  return {
    ...base,
    kind: resolveLandmarkKind(input as Record<string, unknown>),
  }
}

async function upsertLandmarkRow(
  input: Partial<VenueLandmarkRow> & { label: string },
  rect: FloorGridRect
): Promise<VenueLandmarkRow> {
  const withKind = landmarkPayload(input, rect, true)
  const withoutKind = landmarkPayload(input, rect, false)

  const run = async (row: Record<string, unknown>, select: string) => {
    if (input.id) {
      return supabase.from('venue_landmarks').update(row).eq('id', input.id).select(select).single()
    }
    return supabase.from('venue_landmarks').insert(row).select(select).single()
  }

  let result = await run(withKind, LANDMARK_SELECT)
  if (
    result.error &&
    isMissingSchemaError(result.error.message, [/rotation/i, /is_line/i, /column/i, /schema cache/i])
  ) {
    const legacyWithKind = landmarkPayloadWithoutRotationLine(input, rect, true)
    const legacyWithoutKind = landmarkPayloadWithoutRotationLine(input, rect, false)
    result = await run(legacyWithKind, LANDMARK_SELECT_LEGACY)
    if (
      result.error &&
      isMissingSchemaError(result.error.message, [/kind/i, /column/i, /schema cache/i])
    ) {
      result = await run(legacyWithoutKind, LANDMARK_SELECT_LEGACY_NO_KIND)
    }
  } else if (
    result.error &&
    isMissingSchemaError(result.error.message, [/kind/i, /column/i, /schema cache/i])
  ) {
    result = await run(withoutKind, LANDMARK_SELECT_NO_KIND)
  }

  if (result.error) throw new Error(result.error.message || 'Failed to save landmark.')
  if (!result.data) throw new Error('Failed to save landmark.')
  return parseLandmarkRow(result.data as unknown as Record<string, unknown>)
}

export async function upsertVenueLandmark(
  input: Partial<VenueLandmarkRow> & { label: string }
): Promise<VenueLandmarkRow> {
  const rect = Boolean(input.is_line)
    ? normalizeLandmarkLineRect(input)
    : normalizeFloorRect(input, FLOOR_DEFAULT_LANDMARK_SPAN)
  if (!input.label.trim()) throw new Error('Landmark label is required.')
  return upsertLandmarkRow(input, rect)
}

export async function deleteVenueLandmark(id: string): Promise<void> {
  const { error } = await supabase.from('venue_landmarks').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Failed to delete landmark.')
}

/** Guest map: landmarks + table positions. Never throws on missing layout schema. */
export async function loadGuestFloorLayout(): Promise<{
  tables: FloorLayoutTable[]
  landmarks: VenueLandmarkRow[]
  layoutSchemaReady: boolean
}> {
  const { tables, landmarks, layoutSchemaReady } = await loadAdminFloorLayout()
  return {
    tables: tables.filter((t) => t.is_active),
    landmarks,
    layoutSchemaReady,
  }
}
