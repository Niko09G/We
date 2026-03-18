import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'
import {
  normalizeMissionValidationType,
  type MissionValidationType,
} from '@/lib/mission-validation-type'

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
    .order('name')
  if (error) throw new Error(error.message || 'Failed to load tables.')
  return (data ?? []) as SubmitTable[]
}

/** Missions for /submit (reads validation_type; defaults to manual if null). */
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

export type SubmissionType = 'signature' | 'photo' | 'manual'

export async function insertMissionSubmission(input: {
  table_id: string
  mission_id: string
  submission_type: SubmissionType
  submission_data?: Record<string, unknown> | null
}): Promise<void> {
  const { error } = await supabase.from('mission_submissions').insert({
    table_id: input.table_id,
    mission_id: input.mission_id,
    status: 'pending',
    submission_type: input.submission_type,
    submission_data: input.submission_data ?? null,
  })
  if (error) {
    if (error.code === '23505')
      throw new Error('You already have a pending or approved submission for this table and mission.')
    throw new Error(error.message || 'Failed to save submission.')
  }
}
