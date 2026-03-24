import { v4 as uuidv4 } from 'uuid'

import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'
import {
  normalizeMissionValidationType,
  type MissionValidationType,
} from '@/lib/mission-validation-type'
import type { SubmissionType } from './mission-submission-core'

export type { SubmissionType } from './mission-submission-core'

const BUCKET = 'mission-submissions'

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/mission-submissions/'
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

export type SubmitTable = { id: string; name: string }
/** Mission row for /submit including validation_type from DB. */
export type SubmitMission = Pick<
  MissionsTableRow,
  'id' | 'title' | 'max_submissions_per_table'
> & {
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
    .select('id,title,description,points,validation_type,max_submissions_per_table')
    .order('title')

  if (error) throw new Error(error.message || 'Failed to load missions.')

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const maxRaw = r.max_submissions_per_table
    return {
      id: row.id as string,
      title: (row.title as string) || 'Mission',
      max_submissions_per_table:
        maxRaw === null || maxRaw === undefined
          ? null
          : Math.max(1, Math.floor(Number(maxRaw))),
      validation_type: normalizeMissionValidationType(
        row.validation_type as string | null | undefined
      ),
    }
  })
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
  const path = `${uuidv4()}.${ext}`

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
  const path = `videos/${uuidv4()}.${ext}`

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
  const path = `signatures/${uuidv4()}.png`

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

/** Best-effort cleanup for uploaded mission media when DB write fails. */
export async function removeMissionSubmissionUploadByUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}

type SubmitApiSuccess = {
  success: true
  autoApproved: boolean
  repeatable: boolean
  approvedCount?: number
  missionSubmissionId?: string
}

type SubmitApiError = {
  success: false
  error: string
}

/**
 * Creates a mission submission via POST /api/missions/submit (canonical server path).
 * Upload media first with the upload* helpers; then call this with URLs / text in submission_data.
 */
export async function insertMissionSubmission(input: {
  table_id: string
  mission_id: string
  submission_type: SubmissionType
  submission_data?: Record<string, unknown> | null
  client_request_id?: string | null
}): Promise<{
  autoApproved: boolean
  repeatable: boolean
  approvedCount?: number
  missionSubmissionId?: string
}> {
  const res = await fetch('/api/missions/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: input.table_id,
      mission_id: input.mission_id,
      submission_type: input.submission_type,
      submission_data: input.submission_data ?? null,
      client_request_id: input.client_request_id ?? null,
    }),
  })

  const rawText = await res.text()
  let body: unknown
  try {
    body = rawText ? JSON.parse(rawText) : {}
  } catch {
    throw new Error(
      rawText?.trim() ? rawText.slice(0, 200) : `Submission failed (${res.status})`
    )
  }

  const data = body as Partial<SubmitApiSuccess> & Partial<SubmitApiError>
  if (!res.ok || data.success === false) {
    const msg =
      typeof data.error === 'string' && data.error.length > 0
        ? data.error
        : `Submission failed (${res.status})`
    throw new Error(msg)
  }

  if (data.success !== true) {
    throw new Error('Submission failed.')
  }

  const ok = data as SubmitApiSuccess
  return {
    autoApproved: ok.autoApproved,
    repeatable: ok.repeatable,
    approvedCount: ok.approvedCount,
    missionSubmissionId: ok.missionSubmissionId,
  }
}
