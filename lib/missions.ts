import type { SupabaseClient } from '@supabase/supabase-js'
import {
  normalizeMissionValidationType,
  type MissionValidationType,
} from '@/lib/mission-validation-type'

export const GUEST_MISSION_SELECT =
  'id,title,description,points,points_per_submission,validation_type,approval_mode,is_active,allow_multiple_submissions,max_submissions_per_table,message_required,target_person_name,submission_hint,header_title,header_image_url,card_theme_index,card_cover_image_url,success_message,card_cta_label,card_completed_label'

export type GuestMissionRow = {
  id: string
  title: string
  description: string | null
  points: number
  points_per_submission?: number | null
  validation_type: MissionValidationType
  is_active: boolean
  approval_mode?: 'auto' | 'manual'
  allow_multiple_submissions?: boolean
  max_submissions_per_table?: number | null
  message_required?: boolean
  target_person_name?: string | null
  submission_hint?: string | null
  header_title?: string | null
  header_image_url?: string | null
  card_theme_index?: number | null
  card_cover_image_url?: string | null
  success_message?: string | null
  card_cta_label?: string | null
  card_completed_label?: string | null
  created_at?: string
}

function mapGuestMissionRow(m: Record<string, unknown>): GuestMissionRow {
  return {
    id: m.id as string,
    title: m.title as string,
    description: (m.description as string | null) ?? null,
    points: Number(m.points) || 0,
    points_per_submission:
      m.points_per_submission == null || m.points_per_submission === undefined
        ? null
        : Math.max(0, Math.floor(Number(m.points_per_submission))),
    validation_type: normalizeMissionValidationType(
      m.validation_type as string | null | undefined
    ),
    is_active: (m.is_active as boolean | undefined) ?? true,
    approval_mode: String(m.approval_mode ?? 'manual') === 'auto' ? 'auto' : 'manual',
    allow_multiple_submissions: (m.allow_multiple_submissions as boolean | undefined) ?? false,
    max_submissions_per_table:
      m.max_submissions_per_table === undefined || m.max_submissions_per_table === null
        ? null
        : Math.max(1, Math.floor(Number(m.max_submissions_per_table))),
    message_required: (m.message_required as boolean | undefined) ?? false,
    target_person_name: (m.target_person_name as string | null) ?? null,
    submission_hint: (m.submission_hint as string | null) ?? null,
    header_title: (m.header_title as string | null) ?? null,
    header_image_url: (m.header_image_url as string | null) ?? null,
    card_theme_index:
      m.card_theme_index == null
        ? null
        : Math.max(0, Math.min(5, Math.floor(Number(m.card_theme_index)))),
    card_cover_image_url: (m.card_cover_image_url as string | null) ?? null,
    success_message: (m.success_message as string | null) ?? null,
    card_cta_label: (m.card_cta_label as string | null) ?? null,
    card_completed_label: (m.card_completed_label as string | null) ?? null,
    created_at: typeof m.created_at === 'string' ? m.created_at : undefined,
  }
}

/** Active mission ids assigned to one or more tables in team scope. */
export async function fetchAssignedMissionIds(
  client: SupabaseClient,
  scopeTableIds: string[]
): Promise<string[]> {
  if (scopeTableIds.length === 0) return []

  const { data, error } = await client
    .from('mission_assignments')
    .select('mission_id')
    .in('table_id', scopeTableIds)
    .eq('is_active', true)

  if (error) throw new Error(`mission_assignments: ${error.message}`)

  return [...new Set(((data ?? []) as Array<{ mission_id: string }>).map((r) => r.mission_id))]
}

/** Guest carousel missions for assigned ids — bypasses Next.js fetch cache on the server. */
export async function fetchActiveGuestMissions(
  client: SupabaseClient,
  assignedMissionIds: string[]
): Promise<GuestMissionRow[]> {
  if (assignedMissionIds.length === 0) return []

  const query = client
    .from('missions')
    .select(GUEST_MISSION_SELECT)
    .in('id', assignedMissionIds)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('title')

  const { data, error } = await query

  if (error) throw new Error(`missions: ${error.message}`)

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapGuestMissionRow)
}

/** Load assigned + active guest missions for a team scope in one call. */
export async function fetchGuestMissionsForScope(
  client: SupabaseClient,
  scopeTableIds: string[]
): Promise<GuestMissionRow[]> {
  const assignedMissionIds = await fetchAssignedMissionIds(client, scopeTableIds)
  return fetchActiveGuestMissions(client, assignedMissionIds)
}
