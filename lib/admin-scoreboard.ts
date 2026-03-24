import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { deleteMissionGeneratedGreetingsBySubmissionId } from './greetings-admin'
import { isRepeatableAutoMission } from '@/lib/mission-limits'
import { adminResetWithArchive } from '@/lib/admin-recovery'

export type ScoreEventKind = 'completion' | 'repeatable_approved_submission'

export type ScoreEvent = {
  kind: ScoreEventKind
  /** completion.id or mission_submissions.id */
  eventId: string
  tableId: string
  missionId: string
  missionTitle: string
  points: number
  /** ISO timestamp */
  timestamp: string
  sourceLabel: string
}

export type TableScoreBreakdown = {
  tableId: string
  tableName: string
  tableColor: string | null
  totalPoints: number
  events: ScoreEvent[]
}

const COMPLETIONS_DELETE_POLICY_HINT =
  'If this mentions RLS or “permission denied”, run supabase/schema/completions_delete_policy.sql in the Supabase SQL editor (completions table needs a DELETE policy).'

function formatSupabaseError(prefix: string, err: PostgrestError): string {
  const bits = [
    prefix + ':',
    err.message,
    err.code ? `[${err.code}]` : '',
    err.details ? `Details: ${err.details}` : '',
    err.hint ? `Hint: ${err.hint}` : '',
  ].filter(Boolean)
  return bits.join(' ')
}

function throwIfError(prefix: string, error: PostgrestError | null): void {
  if (!error) return
  let msg = formatSupabaseError(prefix, error)
  if (/^Delete.*completions?/i.test(prefix)) {
    msg += ` ${COMPLETIONS_DELETE_POLICY_HINT}`
  }
  throw new Error(msg)
}

function formatPoints(points: number): number {
  return Number.isFinite(points) ? points : 0
}

export async function fetchAdminScoreBreakdown(): Promise<
  TableScoreBreakdown[]
> {
  const [tablesRes, missionsRes, completionsRes, repeatableApprovedRes] =
    await Promise.all([
      supabase
        .from('tables')
        .select('id,name,color')
        .eq('is_archived', false)
        .order('name'),
      supabase.from('missions').select(
        'id,title,points,allow_multiple_submissions,max_submissions_per_table,points_per_submission,approval_mode,validation_type,add_to_greetings'
      ),
      supabase
        .from('completions')
        .select('id,table_id,mission_id,created_at'),
      supabase
        .from('mission_submissions')
        .select('id,table_id,mission_id,status,approved_at,submission_type,submission_data')
        .eq('status', 'approved'),
    ])

  throwIfError('Load tables', tablesRes.error)
  throwIfError('Load missions', missionsRes.error)
  throwIfError('Load completions', completionsRes.error)
  throwIfError('Load approved mission submissions', repeatableApprovedRes.error)

  const tables = (tablesRes.data ?? []) as Array<{
    id: string
    name: string
    color: string | null
  }>

  const missions = (missionsRes.data ?? []) as Array<{
    id: string
    title: string
    points: number
    allow_multiple_submissions: boolean
    max_submissions_per_table: number | null
    points_per_submission: number | null
    approval_mode: string
    validation_type: string
    add_to_greetings: boolean
  }>

  const missionById = new Map(missions.map((m) => [m.id, m]))

  const oneTimeCompletionPoints = new Map<string, number>()
  missions.forEach((m) => {
    if (
      !isRepeatableAutoMission({
        approval_mode: m.approval_mode,
        max_submissions_per_table: m.max_submissions_per_table,
        allow_multiple_submissions: m.allow_multiple_submissions,
      })
    ) {
      oneTimeCompletionPoints.set(m.id, m.points ?? 0)
    }
  })

  const repeatableSubmissionPoints = new Map<string, number>()
  missions.forEach((m) => {
    if (m.validation_type === 'beatcoin') return
    if (
      isRepeatableAutoMission({
        approval_mode: m.approval_mode,
        max_submissions_per_table: m.max_submissions_per_table,
        allow_multiple_submissions: m.allow_multiple_submissions,
      })
    ) {
      repeatableSubmissionPoints.set(
        m.id,
        m.points_per_submission != null ? m.points_per_submission : m.points ?? 0
      )
    }
  })

  const completions = (completionsRes.data ?? []) as Array<{
    id: string
    table_id: string
    mission_id: string
    created_at: string
  }>

  const repeatableApproved = (repeatableApprovedRes.data ?? []) as Array<{
    id: string
    table_id: string
    mission_id: string
    status: string
    approved_at: string | null
    submission_type: string | null
    submission_data: { points_awarded?: number } | null
  }>

  const breakdownByTable = new Map<string, TableScoreBreakdown>()
  tables.forEach((t) => {
    breakdownByTable.set(t.id, {
      tableId: t.id,
      tableName: t.name,
      tableColor: t.color,
      totalPoints: 0,
      events: [],
    })
  })

  for (const c of completions) {
    const mission = missionById.get(c.mission_id)
    if (!mission) continue
    const points = oneTimeCompletionPoints.get(c.mission_id) ?? 0
    const ts = c.created_at

    const table = breakdownByTable.get(c.table_id)
    if (!table) continue
    table.events.push({
      kind: 'completion',
      eventId: c.id,
      tableId: c.table_id,
      missionId: c.mission_id,
      missionTitle: mission.title ?? c.mission_id,
      points: formatPoints(points),
      timestamp: ts,
      sourceLabel: 'manual completion',
    })
  }

  for (const s of repeatableApproved) {
    const mission = missionById.get(s.mission_id)
    if (!mission) continue

    let points: number
    if (mission.validation_type === 'beatcoin') {
      const raw = s.submission_data?.points_awarded
      const n = typeof raw === 'number' ? raw : Number(raw)
      points = formatPoints(Number.isFinite(n) ? n : 0)
    } else {
      const p = repeatableSubmissionPoints.get(s.mission_id)
      if (p == null) continue
      points = formatPoints(p)
    }

    const ts = s.approved_at ?? ''
    const table = breakdownByTable.get(s.table_id)
    if (!table) continue

    const isGreeting = mission.add_to_greetings === true
    table.events.push({
      kind: 'repeatable_approved_submission',
      eventId: s.id,
      tableId: s.table_id,
      missionId: s.mission_id,
      missionTitle: mission.title ?? s.mission_id,
      points,
      timestamp: ts,
      sourceLabel:
        mission.validation_type === 'beatcoin'
          ? 'Beatcoin claim'
          : isGreeting
            ? 'repeatable greeting mission'
            : 'approved submission',
    })
  }

  for (const table of breakdownByTable.values()) {
    table.events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    table.totalPoints = table.events.reduce((sum, e) => sum + (e.points ?? 0), 0)
  }

  const out = tables.map((t) => breakdownByTable.get(t.id)!).filter(Boolean)
  return out
}

export async function undoAdminScoreEvent(event: ScoreEvent): Promise<void> {
  if (event.kind === 'completion') {
    // 1) Remove scoring first (leaderboard uses completions for one-time missions).
    const delRes = await supabase
      .from('completions')
      .delete()
      .eq('id', event.eventId)
      .select('id')

    throwIfError('Delete completion', delRes.error)

    if (!delRes.data || delRes.data.length === 0) {
      throw new Error(
        `Undo failed: no completion row was deleted for id ${event.eventId}. It may have already been removed. ${COMPLETIONS_DELETE_POLICY_HINT}`
      )
    }

    // 2) Keep guest/submission state consistent: revert approved submissions for same table+mission.
    const { data: approvedSubs, error: subErr } = await supabase
      .from('mission_submissions')
      .select('id')
      .eq('table_id', event.tableId)
      .eq('mission_id', event.missionId)
      .eq('status', 'approved')

    if (subErr)
      throw new Error(
        formatSupabaseError('Load mission submissions after completion delete', subErr)
      )

    const now = new Date().toISOString()
    const ids = (approvedSubs ?? []).map((r) => r.id as string)

    if (ids.length > 0) {
      const upRes = await supabase
        .from('mission_submissions')
        .update({
          status: 'rejected',
          approved_at: null,
          review_note: `Undo completion by admin on ${now}`,
        })
        .in('id', ids)
        .select('id')

      throwIfError('Revert mission submissions after completion delete', upRes.error)

      if (!upRes.data || upRes.data.length !== ids.length) {
        throw new Error(
          `Partial failure: completion was deleted but only ${upRes.data?.length ?? 0} of ${ids.length} mission submission(s) were reverted. Refresh and try again.`
        )
      }

      for (const sid of ids) {
        try {
          await deleteMissionGeneratedGreetingsBySubmissionId(sid)
        } catch (e) {
          throw new Error(
            `Completion removed and submissions reverted, but greeting cleanup failed for submission ${sid}: ${e instanceof Error ? e.message : String(e)}`
          )
        }
      }
    }

    return
  }

  const now = new Date().toISOString()
  const upRes = await supabase
    .from('mission_submissions')
    .update({
      status: 'rejected',
      approved_at: null,
      review_note: `Undone by admin on ${now}`,
    })
    .eq('id', event.eventId)
    .select('id')

  throwIfError('Reject mission submission (undo score)', upRes.error)

  if (!upRes.data || upRes.data.length === 0) {
    throw new Error(
      `Undo failed: no approved mission submission was updated for id ${event.eventId}. It may have already been undone.`
    )
  }

  try {
    await deleteMissionGeneratedGreetingsBySubmissionId(event.eventId)
  } catch (e) {
    throw new Error(
      `Submission was rejected but greeting cleanup failed: ${e instanceof Error ? e.message : String(e)}`
    )
  }
}

export async function undoAdminScoreEvents(events: ScoreEvent[]): Promise<void> {
  for (const e of events) {
    await undoAdminScoreEvent(e)
  }
}

export async function resetAdminScoresForTable(tableId: string): Promise<void> {
  await adminResetWithArchive({
    scope: 'table_all_progress',
    table_id: tableId,
    note: 'Scoreboard: reset all progress for one table',
  })
}

export async function resetAdminAllScores(): Promise<void> {
  await adminResetWithArchive({
    scope: 'event_all_progress',
    note: 'Scoreboard: reset all event progress',
  })
}
