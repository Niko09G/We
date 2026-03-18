import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'

export const VALIDATION_TYPES = ['signature', 'photo', 'manual'] as const
export type ValidationType = (typeof VALIDATION_TYPES)[number]

export type MissionRecord = MissionsTableRow

export async function listMissions(): Promise<MissionRecord[]> {
  const { data, error } = await supabase
    .from('missions')
    .select('id,title,description,points,created_at')
    .order('title')

  if (error) throw new Error(error.message || 'Failed to load missions.')
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    points: Number(row.points) || 0,
    created_at: row.created_at as string,
    validation_type: 'manual',
    is_active: true,
  }))
}

export async function createMission(input: {
  title: string
  description: string
  points: number
  validation_type: ValidationType
  is_active: boolean
}): Promise<void> {
  const { error } = await supabase.from('missions').insert({
    title: input.title.trim(),
    description: input.description.trim() || null,
    points: Math.max(0, Math.floor(input.points)),
    validation_type: input.validation_type,
    is_active: input.is_active,
  })
  if (error) throw new Error(error.message || 'Failed to create mission.')
}

export async function updateMission(
  id: string,
  patch: Partial<{
    title: string
    description: string | null
    points: number
    validation_type: ValidationType
    is_active: boolean
  }>
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.description !== undefined) row.description = patch.description?.trim() || null
  if (patch.points !== undefined) row.points = Math.max(0, Math.floor(patch.points))
  if (patch.validation_type !== undefined) row.validation_type = patch.validation_type
  if (patch.is_active !== undefined) row.is_active = patch.is_active
  if (Object.keys(row).length === 0) return

  const { error } = await supabase.from('missions').update(row).eq('id', id)
  if (error) throw new Error(error.message || 'Failed to update mission.')
}
