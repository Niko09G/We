import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'

export const VALIDATION_TYPES = ['photo', 'video', 'signature'] as const
export type ValidationType = (typeof VALIDATION_TYPES)[number]

export const APPROVAL_MODES = ['auto', 'manual'] as const
export type ApprovalMode = (typeof APPROVAL_MODES)[number]

export type MissionRecord = MissionsTableRow

export async function listMissions(): Promise<MissionRecord[]> {
  const { data, error } = await supabase
    .from('missions')
    .select('id,title,description,points,created_at,validation_type,is_active,approval_mode,add_to_greetings,allow_multiple_submissions,points_per_submission,target_person_name,submission_hint,header_title,header_image_url,message_required')
    .order('title')

  if (error) throw new Error(error.message || 'Failed to load missions.')
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    points: Number(row.points) || 0,
    created_at: row.created_at as string,
    validation_type: row.validation_type as string,
    approval_mode: (row.approval_mode as string) ?? 'auto',
    is_active: row.is_active as boolean,
    add_to_greetings: Boolean((row as Record<string, unknown>).add_to_greetings),
    allow_multiple_submissions: Boolean((row as Record<string, unknown>).allow_multiple_submissions),
    points_per_submission: (row as Record<string, unknown>).points_per_submission != null
      ? Number((row as Record<string, unknown>).points_per_submission)
      : null,
    target_person_name: (row as Record<string, unknown>).target_person_name as string | null ?? null,
    submission_hint: (row as Record<string, unknown>).submission_hint as string | null ?? null,
    header_title: (row as Record<string, unknown>).header_title as string | null ?? null,
    header_image_url: (row as Record<string, unknown>).header_image_url as string | null ?? null,
    message_required: Boolean((row as Record<string, unknown>).message_required),
  }))
}

export async function createMission(input: {
  title: string
  description: string
  points: number
  validation_type: ValidationType
  approval_mode: ApprovalMode
  is_active: boolean
  add_to_greetings?: boolean
  allow_multiple_submissions?: boolean
  points_per_submission?: number | null
  target_person_name?: string | null
  submission_hint?: string | null
  header_title?: string | null
  header_image_url?: string | null
  message_required?: boolean
}): Promise<void> {
  const row: Record<string, unknown> = {
    title: input.title.trim(),
    description: input.description.trim() || null,
    points: Math.max(0, Math.floor(input.points)),
    validation_type: input.validation_type,
    approval_mode: input.approval_mode,
    is_active: input.is_active,
    add_to_greetings: input.add_to_greetings ?? false,
    allow_multiple_submissions: input.allow_multiple_submissions ?? false,
    points_per_submission: input.points_per_submission ?? null,
    target_person_name: input.target_person_name?.trim() || null,
    submission_hint: input.submission_hint?.trim() || null,
    header_title: input.header_title?.trim() || null,
    header_image_url: input.header_image_url?.trim() || null,
    message_required: input.message_required ?? false,
  }
  const { error } = await supabase.from('missions').insert(row)
  if (error) throw new Error(error.message || 'Failed to create mission.')
}

export async function updateMission(
  id: string,
  patch: Partial<{
    title: string
    description: string | null
    points: number
    validation_type: ValidationType
    approval_mode: ApprovalMode
    is_active: boolean
    add_to_greetings: boolean
    allow_multiple_submissions: boolean
    points_per_submission: number | null
    target_person_name: string | null
    submission_hint: string | null
    header_title: string | null
    header_image_url: string | null
    message_required: boolean
  }>
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.description !== undefined) row.description = patch.description?.trim() || null
  if (patch.points !== undefined) row.points = Math.max(0, Math.floor(patch.points))
  if (patch.validation_type !== undefined) row.validation_type = patch.validation_type
  if (patch.approval_mode !== undefined) row.approval_mode = patch.approval_mode
  if (patch.is_active !== undefined) row.is_active = patch.is_active
  if (patch.add_to_greetings !== undefined) row.add_to_greetings = patch.add_to_greetings
  if (patch.allow_multiple_submissions !== undefined) row.allow_multiple_submissions = patch.allow_multiple_submissions
  if (patch.points_per_submission !== undefined) row.points_per_submission = patch.points_per_submission == null ? null : Math.max(0, Math.floor(patch.points_per_submission))
  if (patch.target_person_name !== undefined) row.target_person_name = patch.target_person_name?.trim() || null
  if (patch.submission_hint !== undefined) row.submission_hint = patch.submission_hint?.trim() || null
  if (patch.header_title !== undefined) row.header_title = patch.header_title?.trim() || null
  if (patch.header_image_url !== undefined) row.header_image_url = patch.header_image_url?.trim() || null
  if (patch.message_required !== undefined) row.message_required = patch.message_required
  if (Object.keys(row).length === 0) return

  const { error } = await supabase.from('missions').update(row).eq('id', id)
  if (error) throw new Error(error.message || 'Failed to update mission.')
}
