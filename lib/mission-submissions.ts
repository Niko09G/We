import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'
import {
  normalizeMissionValidationType,
  type MissionValidationType,
} from '@/lib/mission-validation-type'
import { getMissionsEnabled } from '@/lib/app-settings'

const BUCKET = 'mission-submissions'

export type SubmitTable = { id: string; name: string }
/** Mission row for /submit including validation_type from DB. */
export type SubmitMission = Pick<MissionsTableRow, 'id' | 'title'> & {
  validation_type: MissionValidationType
}

export async function listTablesForSubmit(): Promise<SubmitTable[]> {
  const { data, error } = await supabase
    .from('tables')
    .select('id,name')
    .eq('is_archived', false)
    .order('name')
  if (error) throw new Error(error.message || 'Failed to load tables.')
  return (data ?? []) as SubmitTable[]
}

/** Missions for /submit (reads validation_type; defaults to photo if null). */
export async function listActiveMissionsForSubmit(): Promise<SubmitMission[]> {
  const { data, error } = await supabase
    .from('missions')
    .select('id,title,description,points,validation_type')
    .order('title')

  if (error) throw new Error(error.message || 'Failed to load missions.')

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) || 'Mission',
    validation_type: normalizeMissionValidationType(
      row.validation_type as string | null | undefined
    ),
  }))
}

export async function uploadMissionSubmissionImage(
  blob: Blob,
  contentType: string
): Promise<string> {
  const ext =
    contentType === 'image/png'
      ? 'png'
      : contentType === 'image/webp'
        ? 'webp'
        : 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: false })

  if (uploadError) {
    throw new Error(uploadError.message || 'Image upload failed.')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

/** Upload video for mission submission; returns public URL. Store in submission_data.video_url. */
export async function uploadMissionSubmissionVideo(
  blob: Blob,
  contentType: string
): Promise<string> {
  const ext = contentType === 'video/mp4' ? 'mp4' : 'webm'
  const path = `videos/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: false })

  if (uploadError) {
    throw new Error(uploadError.message || 'Video upload failed.')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

/** Upload signature pad image (PNG); returns public URL. Store in submission_data.signature_image_url. */
export async function uploadMissionSubmissionSignatureImage(blob: Blob): Promise<string> {
  const path = `signatures/${crypto.randomUUID()}.png`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/png', upsert: false })

  if (uploadError) {
    throw new Error(uploadError.message || 'Signature upload failed.')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

export type SubmissionType = 'signature' | 'photo' | 'video'

export async function insertMissionSubmission(input: {
  table_id: string
  mission_id: string
  submission_type: SubmissionType
  submission_data?: Record<string, unknown> | null
}): Promise<{
  autoApproved: boolean
  repeatable: boolean
  approvedCount?: number
  missionSubmissionId?: string
}> {
  // Lock must behave like a PAUSE: do not clear any progress;
  // just prevent creating new submissions while missions are disabled.
  const enabled = await getMissionsEnabled()
  if (enabled !== true) {
    throw new Error('Missions are currently opening soon. Please try again later.')
  }

  // Only allow submissions for active assignments (table-specific missions).
  const { data: assignment, error: aErr } = await supabase
    .from('mission_assignments')
    .select('id')
    .eq('table_id', input.table_id)
    .eq('mission_id', input.mission_id)
    .eq('is_active', true)
    .maybeSingle()

  if (aErr) throw new Error(aErr.message || 'Failed to validate mission availability.')
  if (!assignment) {
    throw new Error('This mission is not available for your table.')
  }

  const { data: teamRow, error: teamErr } = await supabase
    .from('tables')
    .select('id,is_archived,is_active')
    .eq('id', input.table_id)
    .maybeSingle()
  if (teamErr) throw new Error(teamErr.message || 'Failed to verify table.')
  if (!teamRow) throw new Error('Table not found.')
  if ((teamRow as { is_archived?: boolean }).is_archived === true) {
    throw new Error('This table is archived.')
  }
  if ((teamRow as { is_active?: boolean }).is_active === false) {
    throw new Error('This table is not active.')
  }

  const { data: mission, error: mErr } = await supabase
    .from('missions')
    .select(
      'id,title,approval_mode,allow_multiple_submissions,add_to_greetings,points_per_submission,message_required'
    )
    .eq('id', input.mission_id)
    .maybeSingle()

  if (mErr) throw new Error(mErr.message || 'Failed to load mission settings.')
  if (!mission) throw new Error('Mission not found.')

  const allowMultiple = (mission as Record<string, unknown>).allow_multiple_submissions === true
  const approvalMode = String((mission as Record<string, unknown>).approval_mode ?? 'manual')
  const isRepeatableAuto = allowMultiple && approvalMode === 'auto'
  const messageRequired = (mission as Record<string, unknown>).message_required === true
  const message = (input.submission_data?.message as string | undefined)?.trim()

  if (messageRequired && !message) {
    throw new Error('Message is required for this mission.')
  }

  // Preserve one-time behavior via explicit checks now that DB may allow multiple approved rows.
  if (!allowMultiple) {
    const [subRes, compRes] = await Promise.all([
      supabase
        .from('mission_submissions')
        .select('id')
        .eq('table_id', input.table_id)
        .eq('mission_id', input.mission_id)
        .in('status', ['pending', 'approved'])
        .limit(1),
      supabase
        .from('completions')
        .select('id')
        .eq('table_id', input.table_id)
        .eq('mission_id', input.mission_id)
        .limit(1),
    ])
    if (subRes.error) throw new Error(subRes.error.message || 'Failed to validate existing submissions.')
    if (compRes.error) throw new Error(compRes.error.message || 'Failed to validate mission completion.')
    if ((subRes.data ?? []).length > 0 || (compRes.data ?? []).length > 0) {
      throw new Error('You already have a pending or approved submission for this table and mission.')
    }
  }

  const nowIso = new Date().toISOString()
  const insertStatus = isRepeatableAuto ? 'approved' : 'pending'
  const { data: inserted, error } = await supabase
    .from('mission_submissions')
    .insert({
    table_id: input.table_id,
    mission_id: input.mission_id,
    status: insertStatus,
    submission_type: input.submission_type,
    submission_data: input.submission_data ?? null,
    approved_at: isRepeatableAuto ? nowIso : null,
  })
    .select('id')
    .maybeSingle()
  if (error) {
    if (error.code === '23505')
      throw new Error('You already have a pending or approved submission for this table and mission.')
    throw new Error(error.message || 'Failed to save submission.')
  }

  // For repeatable auto missions, write greetings immediately when configured.
  if (
    isRepeatableAuto &&
    input.submission_type === 'photo' &&
    (mission as Record<string, unknown>).add_to_greetings === true
  ) {
    const imageUrl = input.submission_data?.image_url
    if (typeof imageUrl === 'string' && imageUrl.length > 0) {
      const missionTitle = String((mission as Record<string, unknown>).title ?? 'Greeting')
      const greetingMessage = message && message.length > 0 ? message : missionTitle
      const missionSubmissionId = inserted?.id as string | undefined
      const { data: table } = await supabase
        .from('tables')
        .select('id,name,color')
        .eq('id', input.table_id)
        .maybeSingle()
      await supabase.from('greetings').insert({
        name: (table?.name as string | undefined) ?? null,
        message: greetingMessage,
        image_url: imageUrl,
        status: 'ready',
        source_type: 'mission',
        table_id: input.table_id,
        table_name: (table?.name as string | undefined) ?? null,
        table_color: ((table as { color?: string | null } | null)?.color as string | null) ?? null,
        mission_submission_id: missionSubmissionId ?? null,
      })
    }
  }

  if (isRepeatableAuto) {
    const { count, error: cErr } = await supabase
      .from('mission_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('table_id', input.table_id)
      .eq('mission_id', input.mission_id)
      .eq('status', 'approved')
    if (cErr) throw new Error(cErr.message || 'Failed to read submission count.')
    return {
      autoApproved: true,
      repeatable: true,
      approvedCount: typeof count === 'number' ? count : undefined,
      missionSubmissionId: inserted?.id as string | undefined,
    }
  }

  return { autoApproved: false, repeatable: allowMultiple, missionSubmissionId: inserted?.id as string | undefined }
}
