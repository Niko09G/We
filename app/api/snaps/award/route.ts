import { NextResponse } from 'next/server'
import {
  SNAPS_SHOT_POINTS,
  SNAPS_SUBMISSION_SOURCE,
  type SnapsActivityItem,
} from '@/lib/snaps'
import { ensureSnapsMissionId, loadSnapsTeamById } from '@/lib/snaps-mission'
import { requireAdminSessionOrRespond } from '@/lib/require-admin-session'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

/** POST: award +5 BeatCoins for a shot taken. Body: { teamId } */
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

  const teamId =
    typeof (body as { teamId?: unknown }).teamId === 'string'
      ? (body as { teamId: string }).teamId.trim()
      : ''

  if (!teamId) {
    return NextResponse.json(
      { ok: false as const, error: 'teamId is required.' },
      { status: 400 }
    )
  }

  try {
    const supabase = createServiceRoleClient()
    const team = await loadSnapsTeamById(supabase, teamId)
    if (!team) {
      return NextResponse.json(
        { ok: false as const, error: 'Team not found or inactive.' },
        { status: 404 }
      )
    }

    const missionId = await ensureSnapsMissionId(supabase)
    const nowIso = new Date().toISOString()

    const { data: inserted, error: insertErr } = await supabase
      .from('mission_submissions')
      .insert({
        table_id: teamId,
        mission_id: missionId,
        status: 'approved',
        submission_type: 'text',
        submission_data: {
          source: SNAPS_SUBMISSION_SOURCE,
          points_awarded: SNAPS_SHOT_POINTS,
          text: 'Shot taken',
        },
        approved_at: nowIso,
        client_request_id: `snaps:${teamId}:${crypto.randomUUID()}`,
      })
      .select('id,created_at,approved_at')
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        throw new Error(
          'Could not record this shot (duplicate). If this keeps happening, run supabase/schema/repeatable_missions.sql in the Supabase SQL editor.'
        )
      }
      throw new Error(insertErr.message)
    }

    // Completions are unique per table+mission; first shot pings display realtime.
    const { error: completionErr } = await supabase.from('completions').insert({
      table_id: teamId,
      mission_id: missionId,
    })
    if (completionErr && completionErr.code !== '23505') {
      throw new Error(completionErr.message)
    }

    const row = inserted as { id: string; created_at?: string; approved_at?: string | null }
    const activity: SnapsActivityItem = {
      id: row.id,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      points: SNAPS_SHOT_POINTS,
      createdAt: row.approved_at || row.created_at || nowIso,
      undone: false,
    }

    return NextResponse.json({
      ok: true as const,
      team,
      activity,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to award points.'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}
