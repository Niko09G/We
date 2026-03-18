import { supabase } from '@/lib/supabase/client'
import {
  missionValidationTypeLabel,
  normalizeMissionValidationType,
  pendingReviewHintForMissionType,
  type MissionValidationType,
} from '@/lib/mission-validation-type'

export type MissionSubmissionRow = {
  id: string
  table_id: string
  mission_id: string
  status: string
  submission_type: string
  submission_data: Record<string, unknown> | null
  created_at: string
  approved_at: string | null
  table_name: string
  mission_title: string
  /** From missions.validation_type at list time. */
  mission_validation_type: MissionValidationType
  mission_validation_label: string
  pending_review_hint: string
}

export async function listMissionSubmissionsForAdmin(
  limit = 50
): Promise<MissionSubmissionRow[]> {
  const [subRes, tablesRes, missionsRes] = await Promise.all([
    supabase
      .from('mission_submissions')
      .select(
        'id, table_id, mission_id, status, submission_type, submission_data, created_at, approved_at'
      )
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('tables').select('id,name'),
    supabase.from('missions').select('id,title,validation_type'),
  ])

  if (subRes.error) throw new Error(subRes.error.message || 'Failed to load submissions.')
  if (tablesRes.error) throw new Error(tablesRes.error.message || 'Failed to load tables.')
  if (missionsRes.error) throw new Error(missionsRes.error.message || 'Failed to load missions.')

  const tableName = new Map<string, string>()
  ;(tablesRes.data ?? []).forEach((t) =>
    tableName.set(t.id as string, (t.name as string) || '—')
  )
  const missionMeta = new Map<
    string,
    { title: string; validation_type: MissionValidationType }
  >()
  ;(missionsRes.data ?? []).forEach((m) => {
    const vt = normalizeMissionValidationType(m.validation_type as string | null | undefined)
    missionMeta.set(m.id as string, {
      title: (m.title as string) || '—',
      validation_type: vt,
    })
  })

  return (subRes.data ?? []).map((row) => {
    const mid = row.mission_id as string
    const meta = missionMeta.get(mid)
    const mission_validation_type = meta?.validation_type ?? 'manual'
    return {
      id: row.id as string,
      table_id: row.table_id as string,
      mission_id: mid,
      status: row.status as string,
      submission_type: row.submission_type as string,
      submission_data: (row.submission_data as Record<string, unknown> | null) ?? null,
      created_at: row.created_at as string,
      approved_at: (row.approved_at as string | null) ?? null,
      table_name: tableName.get(row.table_id as string) ?? (row.table_id as string).slice(0, 8),
      mission_title: meta?.title ?? mid.slice(0, 8),
      mission_validation_type,
      mission_validation_label: missionValidationTypeLabel(mission_validation_type),
      pending_review_hint: pendingReviewHintForMissionType(mission_validation_type),
    }
  })
}

/**
 * Approve: ensure completion exists (insert or skip duplicate), then mark submission approved.
 */
export async function approveMissionSubmission(submissionId: string): Promise<{
  completionCreated: boolean
}> {
  const { data: sub, error: fetchErr } = await supabase
    .from('mission_submissions')
    .select('id, table_id, mission_id, status')
    .eq('id', submissionId)
    .maybeSingle()

  if (fetchErr) throw new Error(fetchErr.message || 'Failed to load submission.')
  if (!sub) throw new Error('Submission not found.')
  if (sub.status !== 'pending') throw new Error('Only pending submissions can be approved.')

  const tableId = sub.table_id as string
  const missionId = sub.mission_id as string

  let completionCreated = false
  const { error: insErr } = await supabase.from('completions').insert({
    table_id: tableId,
    mission_id: missionId,
  })

  if (insErr) {
    if (insErr.code === '23505') {
      // Already completed — still approve submission, no extra points
    } else {
      throw new Error(insErr.message || 'Failed to record completion.')
    }
  } else {
    completionCreated = true
  }

  const now = new Date().toISOString()
  const { data: updated, error: upErr } = await supabase
    .from('mission_submissions')
    .update({ status: 'approved', approved_at: now })
    .eq('id', submissionId)
    .eq('status', 'pending')
    .select('id')

  if (upErr) throw new Error(upErr.message || 'Failed to approve submission.')
  if (!updated?.length) throw new Error('Submission was already processed.')

  return { completionCreated }
}

export async function rejectMissionSubmission(submissionId: string): Promise<void> {
  const { data: updated, error } = await supabase
    .from('mission_submissions')
    .update({ status: 'rejected' })
    .eq('id', submissionId)
    .eq('status', 'pending')
    .select('id')

  if (error) throw new Error(error.message || 'Failed to reject submission.')
  if (!updated?.length) throw new Error('Submission was already processed or not pending.')
}
