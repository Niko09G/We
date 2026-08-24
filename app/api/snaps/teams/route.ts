import { NextResponse } from 'next/server'
import {
  SNAPS_SHOT_POINTS,
  SNAPS_SUBMISSION_SOURCE,
  type SnapsActivityItem,
} from '@/lib/snaps'
import { ensureSnapsMissionId, mapTableToSnapsTeam } from '@/lib/snaps-mission'
import { canonicalTablesForLobby, resolveTeamId } from '@/lib/table-teams'
import { requireAdminSessionOrRespond } from '@/lib/require-admin-session'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

type TableVisualRow = {
  id: string
  name: string
  color: string | null
  page_config: unknown
  team_id?: string | null
  display_order?: number
}

type SubmissionRow = {
  id: string
  table_id: string
  approved_at: string | null
  created_at: string
  submission_data: { points_awarded?: unknown; source?: unknown } | null
}

/** GET: active teams + last 3 Snaps awards (approved mission_submissions). */
export async function GET() {
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

  try {
    const supabase = createServiceRoleClient()
    const missionId = await ensureSnapsMissionId(supabase)

    const [teamsRes, activityRes] = await Promise.all([
      supabase
        .from('tables')
        .select('id,name,color,page_config,display_order,team_id')
        .eq('is_archived', false)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('mission_submissions')
        .select('id,table_id,approved_at,created_at,submission_data')
        .eq('mission_id', missionId)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(12),
    ])

    if (teamsRes.error) throw new Error(teamsRes.error.message)
    if (activityRes.error) throw new Error(activityRes.error.message)

    const physical = (teamsRes.data ?? []) as TableVisualRow[]
    const canonical = canonicalTablesForLobby(physical)
    const teams = canonical.map(mapTableToSnapsTeam)
    const physicalToTeamId = new Map<string, string>()
    for (const row of physical) {
      physicalToTeamId.set(row.id, resolveTeamId(row))
    }
    const teamById = new Map(teams.map((t) => [t.id, t]))
    const activityRows = (activityRes.data ?? []) as SubmissionRow[]

    const recentActivity: SnapsActivityItem[] = activityRows
      .filter((row) => row.submission_data?.source === SNAPS_SUBMISSION_SOURCE)
      .slice(0, 3)
      .map((row) => {
        const teamId = physicalToTeamId.get(row.table_id) ?? row.table_id
        const team = teamById.get(teamId) ?? teamById.get(row.table_id)
        const raw = row.submission_data?.points_awarded
        const n = typeof raw === 'number' ? raw : Number(raw)
        return {
          id: row.id,
          teamId,
          teamName: team?.name ?? '—',
          teamColor: team?.color ?? '#71717a',
          points: Number.isFinite(n) && n > 0 ? n : SNAPS_SHOT_POINTS,
          createdAt: row.approved_at || row.created_at,
          undone: false,
        }
      })

    return NextResponse.json({
      ok: true as const,
      teams,
      recentActivity,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load teams.'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}
