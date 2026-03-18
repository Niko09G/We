import { supabase } from '@/lib/supabase/client'

export type AdminTableRow = {
  id: string
  name: string
  color: string | null
  is_active: boolean
  created_at: string
}

export async function listTablesForAdmin(): Promise<AdminTableRow[]> {
  const { data, error } = await supabase
    .from('tables')
    .select('id, name, color, is_active, created_at')
    .order('name')

  if (error) throw new Error(error.message || 'Failed to load tables.')
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? '',
    color: (row.color as string | null) ?? null,
    is_active: (row.is_active as boolean) ?? true,
    created_at: (row.created_at as string) ?? new Date().toISOString(),
  }))
}

export async function createTable(input: {
  name: string
  color?: string | null
  is_active?: boolean
}): Promise<void> {
  const name = input.name.trim()
  if (!name) throw new Error('Table name is required.')

  const { error } = await supabase.from('tables').insert({
    name,
    color: input.color?.trim() || null,
    is_active: input.is_active ?? true,
  })

  if (error) {
    if (error.code === '23505')
      throw new Error('A table with this name already exists.')
    throw new Error(error.message || 'Failed to create table.')
  }
}

export async function updateTable(
  id: string,
  patch: { name?: string; color?: string | null; is_active?: boolean }
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.color !== undefined) row.color = patch.color?.trim() || null
  if (patch.is_active !== undefined) row.is_active = patch.is_active
  if (Object.keys(row).length === 0) return

  const { error } = await supabase.from('tables').update(row).eq('id', id)

  if (error) {
    if (error.code === '23505')
      throw new Error('A table with this name already exists.')
    throw new Error(error.message || 'Failed to update table.')
  }
}
