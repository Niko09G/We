import { NextResponse } from 'next/server'
import { SNAPS_SUBMISSION_SOURCE } from '@/lib/snaps'
import { loadSnapsTeamById } from '@/lib/snaps-mission'
import { requireAdminSessionOrRespond } from '@/lib/require-admin-session'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

/** POST: undo a snaps award. Body: { activityId } (mission_submissions.id) */
export async function POST(request: Request) {
  const authError = await requireAdminSessionOrRespond()
  if (authError) return authError

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        ok: false as const,
        error:
          'Set SUPABASE_SERVICE_ROLE_KEY on the server to manage snaps scores.',
      },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false as const, error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }

  const activityId =
    typeof (body as { activityId?: unknown }).activityId === 'string'
      ? (body as { activityId: string }).activityId.trim()
      : ''

  if (!activityId) {
    return NextResponse.json(
      { ok: false as const, error: 'activityId is required.' },
      { status: 400 }
    )
  }

  try {
    const supabase = createServiceRoleClient()

    const { data: submission, error: fetchErr } = await supabase
      .from('mission_submissions')
      .select('id,table_id,status,submission_data')
      .eq('id', activityId)
      .maybeSingle()

    if (fetchErr) throw new Error(fetchErr.message)
    if (!submission) {
      return NextResponse.json(
        { ok: false as const, error: 'Activity not found.' },
        { status: 404 }
      )
    }

    const row = submission as {
      id: string
      table_id: string
      status: string
      submission_data: { source?: unknown } | null
    }

    if (row.submission_data?.source !== SNAPS_SUBMISSION_SOURCE) {
      return NextResponse.json(
        { ok: false as const, error: 'This is not a Snaps award.' },
        { status: 400 }
      )
    }

    if (row.status !== 'approved') {
      return NextResponse.json(
        { ok: false as const, error: 'This action was already undone.' },
        { status: 409 }
      )
    }

    const { data: undone, error: undoErr } = await supabase
      .from('mission_submissions')
      .update({
        status: 'rejected',
        review_note: 'Snaps host undo',
      })
      .eq('id', activityId)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle()

    if (undoErr) throw new Error(undoErr.message)
    if (!undone) {
      return NextResponse.json(
        { ok: false as const, error: 'Could not undo — it may have already been reversed.' },
        { status: 409 }
      )
    }

    const team = await loadSnapsTeamById(supabase, row.table_id)
    if (!team) {
      return NextResponse.json(
        { ok: false as const, error: 'Team not found.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true as const,
      team,
      activityId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to undo.'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}
