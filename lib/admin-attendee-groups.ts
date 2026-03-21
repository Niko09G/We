import { supabase } from '@/lib/supabase/client'

export type AttendeeGroupRow = {
  id: string
  group_name: string
  notes: string | null
  created_at: string
}

const SELECT = 'id,group_name,notes,created_at'

export async function listAttendeeGroups(): Promise<AttendeeGroupRow[]> {
  const { data, error } = await supabase
    .from('attendee_groups')
    .select(SELECT)
    .order('group_name')

  if (error) throw new Error(error.message || 'Failed to load groups.')
  return (data ?? []) as AttendeeGroupRow[]
}

export async function createAttendeeGroup(input: {
  group_name: string
  notes?: string | null
}): Promise<AttendeeGroupRow> {
  const group_name = input.group_name.trim()
  if (!group_name) throw new Error('Group name is required.')

  const { data, error } = await supabase
    .from('attendee_groups')
    .insert({
      group_name,
      notes: input.notes?.trim() || null,
    })
    .select(SELECT)
    .single()

  if (error) throw new Error(error.message || 'Failed to create group.')
  return data as AttendeeGroupRow
}

export async function updateAttendeeGroup(
  id: string,
  patch: { group_name?: string; notes?: string | null }
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.group_name !== undefined) {
    const n = patch.group_name.trim()
    if (!n) throw new Error('Group name is required.')
    row.group_name = n
  }
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null
  if (Object.keys(row).length === 0) return

  const { error } = await supabase.from('attendee_groups').update(row).eq('id', id)

  if (error) throw new Error(error.message || 'Failed to update group.')
}

/**
 * Deletes the group; attendees.group_id is set to null (FK).
 */
export async function deleteAttendeeGroup(id: string): Promise<void> {
  const { error } = await supabase.from('attendee_groups').delete().eq('id', id)

  if (error) throw new Error(error.message || 'Failed to delete group.')
}
