import { supabase } from '@/lib/supabase/client'

export type AdminTableRow = {
  id: string
  name: string
  color: string | null
  is_active: boolean
  is_archived: boolean
  archived_at: string | null
  created_at: string
  /** Vertical / map ordering (admin lanes + guest seat map slots). */
  display_order: number
  /** Max seats for seating planner (per-table seat numbers 1..capacity). */
  capacity: number
  /** Occupied seats based on attendees assigned to this table with a seat number. */
  occupied_count: number
  /** Guest team page JSON (`/missions/[tableId]`). */
  page_config: unknown | null
}

export async function listTablesForAdmin(): Promise<AdminTableRow[]> {
  const [{ data, error }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from('tables').select('*').order('name'),
    supabase.from('attendees').select('table_id,seat_number,is_archived').not('table_id', 'is', null),
  ])

  if (error) throw new Error(error.message || 'Failed to load tables.')
  if (assignmentsError) throw new Error(assignmentsError.message || 'Failed to load table seat assignments.')

  const occupiedByTableId = new Map<string, number>()
  for (const row of assignments ?? []) {
    const r = row as Record<string, unknown>
    const tableId = r.table_id
    const seat = r.seat_number
    const isArchived = (r.is_archived as boolean | null | undefined) ?? false
    if (typeof tableId !== 'string' || !tableId) continue
    if (isArchived) continue
    if (typeof seat !== 'number' || !Number.isFinite(seat)) continue
    occupiedByTableId.set(tableId, (occupiedByTableId.get(tableId) ?? 0) + 1)
  }

  const rows = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const cap = r.capacity
    const capacity =
      typeof cap === 'number' && Number.isFinite(cap) && cap >= 1
        ? Math.trunc(cap)
        : 10
    const ordRaw = r.display_order
    const display_order =
      typeof ordRaw === 'number' && Number.isFinite(ordRaw) ? Math.trunc(ordRaw) : 0
    return {
      id: row.id as string,
      name: (row.name as string) ?? '',
      color: (row.color as string | null) ?? null,
      is_active: (row.is_active as boolean) ?? true,
      is_archived: (r.is_archived as boolean | undefined) ?? false,
      archived_at: (r.archived_at as string | null) ?? null,
      created_at: (row.created_at as string) ?? new Date().toISOString(),
      display_order,
      capacity,
      occupied_count: occupiedByTableId.get(row.id as string) ?? 0,
      page_config: (r.page_config as unknown) ?? null,
    }
  })
  rows.sort((a, b) => {
    const d = Number(a.is_archived) - Number(b.is_archived)
    if (d !== 0) return d
    if (a.display_order !== b.display_order) return a.display_order - b.display_order
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return rows
}

export async function createTable(input: {
  name: string
  color?: string | null
  is_active?: boolean
  capacity?: number
}): Promise<void> {
  const name = input.name.trim()
  if (!name) throw new Error('Table name is required.')
  const cap =
    input.capacity !== undefined && Number.isFinite(input.capacity)
      ? Math.max(1, Math.trunc(input.capacity))
      : 10

  const { data: maxRow, error: maxErr } = await supabase
    .from('tables')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) throw new Error(maxErr.message || 'Failed to resolve table order.')
  const nextOrder =
    typeof (maxRow as { display_order?: number } | null)?.display_order === 'number'
      ? Math.trunc((maxRow as { display_order: number }).display_order) + 1
      : 0

  const { error } = await supabase.from('tables').insert({
    name,
    color: input.color?.trim() || null,
    is_active: input.is_active ?? true,
    is_archived: false,
    archived_at: null,
    capacity: cap,
    display_order: nextOrder,
  })

  if (error) {
    if (error.code === '23505')
      throw new Error('A table with this name already exists.')
    throw new Error(error.message || 'Failed to create table.')
  }
}

export async function updateTable(
  id: string,
  patch: {
    name?: string
    color?: string | null
    is_active?: boolean
    capacity?: number
    display_order?: number
    /** JSON object for `tables.page_config` (omit to leave unchanged). */
    page_config?: Record<string, unknown> | null
  }
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.color !== undefined) row.color = patch.color?.trim() || null
  if (patch.is_active !== undefined) row.is_active = patch.is_active
  if (patch.capacity !== undefined) {
    const c = Math.max(1, Math.trunc(patch.capacity))
    row.capacity = c
  }
  if (patch.display_order !== undefined) {
    row.display_order = Math.trunc(patch.display_order)
  }
  if (patch.page_config !== undefined) row.page_config = patch.page_config
  if (Object.keys(row).length === 0) return

  const { error } = await supabase.from('tables').update(row).eq('id', id)

  if (error) {
    if (error.code === '23505')
      throw new Error('A table with this name already exists.')
    throw new Error(error.message || 'Failed to update table.')
  }
}

/** Swap display_order between two tables (admin seating reorder). */
export async function swapTableDisplayOrder(aId: string, bId: string): Promise<void> {
  const { data, error } = await supabase
    .from('tables')
    .select('id, display_order')
    .in('id', [aId, bId])
  if (error) throw new Error(error.message || 'Failed to load table order.')
  const rows = (data ?? []) as Array<{ id: string; display_order: number }>
  const a = rows.find((r) => r.id === aId)
  const b = rows.find((r) => r.id === bId)
  if (!a || !b) throw new Error('Table not found for reorder.')
  await Promise.all([
    updateTable(aId, { display_order: b.display_order }),
    updateTable(bId, { display_order: a.display_order }),
  ])
}

/** Soft-delete: hide from guests/scoreboard; keep all related rows. */
export async function archiveTable(id: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('tables')
    .update({ is_archived: true, archived_at: now })
    .eq('id', id)
    .eq('is_archived', false)

  if (error) throw new Error(error.message || 'Failed to archive table.')
}

export async function restoreTable(id: string): Promise<void> {
  const { error } = await supabase
    .from('tables')
    .update({ is_archived: false, archived_at: null })
    .eq('id', id)

  if (error) throw new Error(error.message || 'Failed to restore table.')
}

/**
 * Hard delete: removes the table row. DB FKs cascade to completions, mission_assignments,
 * mission_submissions. Greetings keep snapshot text; table_id may be set null per schema.
 */
export async function permanentlyDeleteTable(id: string): Promise<void> {
  if (typeof window === 'undefined') {
    const { data, error } = await supabase
      .from('tables')
      .delete()
      .eq('id', id)
      .eq('is_archived', true)
      .select('id')

    if (error) throw new Error(error.message || 'Failed to delete table.')
    if (!data || data.length === 0) {
      throw new Error('Table was not deleted. It may already be removed or blocked by permissions.')
    }
    return
  }

  const res = await fetch(`/api/admin/tables/${encodeURIComponent(id)}`, { method: 'DELETE' })
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
  if (!res.ok) {
    throw new Error(body?.error || body?.message || 'Failed to delete table.')
  }
}
