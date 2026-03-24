import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  executeMissionSubmission,
  type SubmissionType,
} from '@/lib/mission-submission-core'

/** Canonical write path for guest mission submissions (limits + validation on server). */
const SUBMISSION_TYPES: SubmissionType[] = ['photo', 'video', 'signature', 'text']

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' } as const,
      { status: 400 }
    )
  }

  const body = json as Record<string, unknown>
  const table_id = typeof body.table_id === 'string' ? body.table_id.trim() : ''
  const mission_id = typeof body.mission_id === 'string' ? body.mission_id.trim() : ''
  const submission_type = body.submission_type
  const submission_data =
    body.submission_data === null || body.submission_data === undefined
      ? null
      : typeof body.submission_data === 'object' && !Array.isArray(body.submission_data)
        ? (body.submission_data as Record<string, unknown>)
        : null
  const client_request_id =
    typeof body.client_request_id === 'string' ? body.client_request_id.trim() : null

  if (!table_id || !mission_id) {
    return NextResponse.json(
      { success: false, error: 'Missing table_id or mission_id' } as const,
      { status: 400 }
    )
  }

  if (!SUBMISSION_TYPES.includes(submission_type as SubmissionType)) {
    return NextResponse.json(
      { success: false, error: 'Invalid submission_type' } as const,
      { status: 400 }
    )
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>
  try {
    supabase = createServerSupabaseClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server configuration error'
    return NextResponse.json({ success: false, error: msg } as const, { status: 500 })
  }

  try {
    const result = await executeMissionSubmission(supabase, {
      table_id,
      mission_id,
      submission_type: submission_type as SubmissionType,
      submission_data,
      client_request_id,
    })
    return NextResponse.json({
      success: true,
      autoApproved: result.autoApproved,
      repeatable: result.repeatable,
      approvedCount: result.approvedCount,
      missionSubmissionId: result.missionSubmissionId,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Submission failed'
    const status =
      message === 'Submission limit reached' ||
      message === 'Message cannot be empty.' ||
      message.includes('not available') ||
      message.includes('already completed') ||
      message.includes('pending or approved')
        ? 422
        : 400
    return NextResponse.json({ success: false, error: message } as const, { status })
  }
}
