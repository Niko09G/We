import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'
import { allowMultipleSubmissionsFlag, parseMaxSubmissionsInput } from '@/lib/mission-limits'
import {
  missionValidationTypeLabel,
  type MissionValidationType,
} from '@/lib/mission-validation-type'

export const VALIDATION_TYPES = ['photo', 'video', 'signature', 'text', 'beatcoin'] as const
export type ValidationType = (typeof VALIDATION_TYPES)[number]

/** Human-friendly label for admin mission type dropdowns (value stays snake_case). */
export function adminValidationTypeLabel(type: ValidationType): string {
  return missionValidationTypeLabel(type as MissionValidationType)
}

export const APPROVAL_MODES = ['auto', 'manual'] as const
export type ApprovalMode = (typeof APPROVAL_MODES)[number]

export type MissionRecord = MissionsTableRow

function missionRecordFromSupabaseRow(row: Record<string, unknown>): MissionRecord {
  const maxRaw = row.max_submissions_per_table
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    points: Number(row.points) || 0,
    created_at: row.created_at as string,
    validation_type: row.validation_type as string,
    approval_mode: (row.approval_mode as string) ?? 'auto',
    is_active: row.is_active as boolean,
    add_to_greetings: Boolean(row.add_to_greetings),
    allow_multiple_submissions: Boolean(row.allow_multiple_submissions),
    max_submissions_per_table:
      maxRaw === null || maxRaw === undefined
        ? null
        : Math.max(1, Math.floor(Number(maxRaw))),
    points_per_submission:
      row.points_per_submission != null ? Number(row.points_per_submission) : null,
    target_person_name: (row.target_person_name as string | null) ?? null,
    submission_hint: (row.submission_hint as string | null) ?? null,
    header_title: (row.header_title as string | null) ?? null,
    header_image_url: (row.header_image_url as string | null) ?? null,
    message_required: Boolean(row.message_required),
    card_theme_index:
      row.card_theme_index == null || row.card_theme_index === ''
        ? null
        : Math.max(0, Math.min(5, Math.floor(Number(row.card_theme_index)))),
    card_cover_image_url: (row.card_cover_image_url as string | null) ?? null,
    success_message: (row.success_message as string | null) ?? null,
    card_cta_label: (row.card_cta_label as string | null) ?? null,
    card_completed_label: (row.card_completed_label as string | null) ?? null,
  }
}

export async function getMissionById(id: string): Promise<MissionRecord | null> {
  const { data, error } = await supabase
    .from('missions')
    .select(
      'id,title,description,points,created_at,validation_type,is_active,approval_mode,add_to_greetings,allow_multiple_submissions,max_submissions_per_table,points_per_submission,target_person_name,submission_hint,header_title,header_image_url,message_required,card_theme_index,card_cover_image_url,success_message,card_cta_label,card_completed_label'
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to load mission.')
  if (!data) return null
  return missionRecordFromSupabaseRow(data as Record<string, unknown>)
}

export async function listMissions(): Promise<MissionRecord[]> {
  const { data, error } = await supabase
    .from('missions')
    .select(
      'id,title,description,points,created_at,validation_type,is_active,approval_mode,add_to_greetings,allow_multiple_submissions,max_submissions_per_table,points_per_submission,target_person_name,submission_hint,header_title,header_image_url,message_required,card_theme_index,card_cover_image_url,success_message,card_cta_label,card_completed_label'
    )
    .order('title')

  if (error) throw new Error(error.message || 'Failed to load missions.')
  return (data ?? []).map((row) => missionRecordFromSupabaseRow(row as Record<string, unknown>))
}

export async function createMission(input: {
  title: string
  description: string
  points: number
  validation_type: ValidationType
  approval_mode: ApprovalMode
  is_active: boolean
  add_to_greetings?: boolean
  /** Empty string = unlimited. */
  max_submissions_per_table?: string | number | null
  points_per_submission?: number | null
  target_person_name?: string | null
  submission_hint?: string | null
  header_title?: string | null
  header_image_url?: string | null
  message_required?: boolean
  card_theme_index?: number | null
  card_cover_image_url?: string | null
  success_message?: string | null
  card_cta_label?: string | null
  card_completed_label?: string | null
}): Promise<string> {
  const max =
    typeof input.max_submissions_per_table === 'string'
      ? parseMaxSubmissionsInput(input.max_submissions_per_table)
      : input.max_submissions_per_table === undefined
        ? null
        : input.max_submissions_per_table === null
          ? null
          : Math.max(1, Math.floor(Number(input.max_submissions_per_table)))

  const row: Record<string, unknown> = {
    title: input.title.trim(),
    description: input.description.trim() || null,
    points: Math.max(0, Math.floor(input.points)),
    validation_type: input.validation_type,
    approval_mode: input.approval_mode,
    is_active: input.is_active,
    add_to_greetings: input.add_to_greetings ?? false,
    max_submissions_per_table: max,
    allow_multiple_submissions: allowMultipleSubmissionsFlag({
      max_submissions_per_table: max,
      allow_multiple_submissions: false,
    }),
    points_per_submission: input.points_per_submission ?? null,
    target_person_name: input.target_person_name?.trim() || null,
    submission_hint: input.submission_hint?.trim() || null,
    header_title: input.header_title?.trim() || null,
    header_image_url: input.header_image_url?.trim() || null,
    message_required: input.message_required ?? false,
  }

  if (input.card_theme_index !== undefined) {
    row.card_theme_index =
      input.card_theme_index === null
        ? null
        : Math.max(0, Math.min(5, Math.floor(input.card_theme_index)))
  }
  if (input.card_cover_image_url !== undefined) {
    row.card_cover_image_url = input.card_cover_image_url?.trim() || null
  }
  if (input.success_message !== undefined) {
    row.success_message = input.success_message?.trim() || null
  }
  if (input.card_cta_label !== undefined) {
    row.card_cta_label = input.card_cta_label?.trim() || null
  }
  if (input.card_completed_label !== undefined) {
    row.card_completed_label = input.card_completed_label?.trim() || null
  }

  const { data, error } = await supabase.from('missions').insert(row).select('id').single()
  if (error) throw new Error(error.message || 'Failed to create mission.')
  return String((data as { id: string }).id)
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
    max_submissions_per_table: string | number | null
    points_per_submission: number | null
    target_person_name: string | null
    submission_hint: string | null
    header_title: string | null
    header_image_url: string | null
    message_required: boolean
    card_theme_index: number | null
    card_cover_image_url: string | null
    success_message: string | null
    card_cta_label: string | null
    card_completed_label: string | null
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
  if (patch.points_per_submission !== undefined)
    row.points_per_submission =
      patch.points_per_submission == null ? null : Math.max(0, Math.floor(patch.points_per_submission))
  if (patch.target_person_name !== undefined) row.target_person_name = patch.target_person_name?.trim() || null
  if (patch.submission_hint !== undefined) row.submission_hint = patch.submission_hint?.trim() || null
  if (patch.header_title !== undefined) row.header_title = patch.header_title?.trim() || null
  if (patch.header_image_url !== undefined) row.header_image_url = patch.header_image_url?.trim() || null
  if (patch.message_required !== undefined) row.message_required = patch.message_required
  if (patch.card_theme_index !== undefined) {
    row.card_theme_index =
      patch.card_theme_index === null
        ? null
        : Math.max(0, Math.min(5, Math.floor(patch.card_theme_index)))
  }
  if (patch.card_cover_image_url !== undefined) {
    row.card_cover_image_url = patch.card_cover_image_url?.trim() || null
  }
  if (patch.success_message !== undefined) {
    row.success_message = patch.success_message?.trim() || null
  }
  if (patch.card_cta_label !== undefined) {
    row.card_cta_label = patch.card_cta_label?.trim() || null
  }
  if (patch.card_completed_label !== undefined) {
    row.card_completed_label = patch.card_completed_label?.trim() || null
  }

  if (patch.max_submissions_per_table !== undefined) {
    const max =
      typeof patch.max_submissions_per_table === 'string'
        ? parseMaxSubmissionsInput(patch.max_submissions_per_table)
        : patch.max_submissions_per_table === null
          ? null
          : Math.max(1, Math.floor(Number(patch.max_submissions_per_table)))
    row.max_submissions_per_table = max
    row.allow_multiple_submissions = allowMultipleSubmissionsFlag({
      max_submissions_per_table: max,
      allow_multiple_submissions: false,
    })
  }

  if (Object.keys(row).length === 0) return

  const { error } = await supabase.from('missions').update(row).eq('id', id)
  if (error) throw new Error(error.message || 'Failed to update mission.')
}

/** Display / form: max as string; empty = unlimited. */
export function maxSubmissionsDisplayValue(m: MissionRecord): string {
  const v = m.max_submissions_per_table
  if (v === null || v === undefined) return ''
  return String(v)
}
