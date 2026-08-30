import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'
import { isRepeatableAutoMission } from '@/lib/mission-limits'
import {
  groupTablesByTeamId,
  pickPrimaryTableForTeam,
  resolveTeamId,
} from '@/lib/table-teams'
import { resolveTeamPageConfig } from '@/lib/team-page-config'

export type TableRow = {
  id: string
  name: string
  color: string | null
  team_id?: string | null
}
/** Subset of missions schema for leaderboard (id, points, title for labels). */
export type MissionRow = Pick<
  MissionsTableRow,
  | 'id'
  | 'points'
  | 'allow_multiple_submissions'
  | 'max_submissions_per_table'
  | 'points_per_submission'
  | 'approval_mode'
  | 'validation_type'
> & { title?: string | null }
export type CompletionRow = {
  id: string
  table_id: string
  mission_id: string
  created_at: string
}

export type RecentActivityItem = {
  id: string
  tableId: string
  tableName: string
  tableColor: string | null
  missionTitle: string
  points: number
  createdAt: string
}

type ApprovedSubmissionRow = {
  id: string
  table_id: string
  mission_id: string
  approved_at: string | null
  submission_type: string | null
  submission_data: { points_awarded?: number } | null
}

export type LeaderboardEntry = {
  /** Parent team id (`tables.team_id`). */
  teamId: string
  /** Parent team name from `teams.name`. */
  teamName: string
  /** Accent color from the team's primary physical table. */
  teamColor: string | null
  totalPoints: number
  completedCount: number
  remainingCount: number
  /** Physical table ids whose scores roll up into this team. */
  memberTableIds: string[]
  /** @deprecated Use `teamId` — kept for existing call sites. */
  tableId: string
  /** @deprecated Use `teamName`. */
  tableName: string
  /** @deprecated Use `teamColor`. */
  tableColor: string | null
  /** Optional team media (page config / teams row). */
  avatar_url?: string | null
  logo_url?: string | null
  image?: string | null
}

export function leaderboardEntryTeamKey(entry: LeaderboardEntry): string {
  return entry.teamId || entry.tableId
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const { leaderboard } = await fetchLeaderboardBundleWithClient(supabase, 0)
  return leaderboard
}

/** Leaderboard + last N completions (single fetch). */
export async function fetchLeaderboardBundle(
  recentLimit = 3
): Promise<{ leaderboard: LeaderboardEntry[]; recentActivity: RecentActivityItem[] }> {
  return fetchLeaderboardBundleWithClient(supabase, recentLimit)
}

/** Server or client: lightweight JSON scores + recent activity (no images). */
export async function fetchLeaderboardBundleWithClient(
  client: SupabaseClient,
  recentLimit = 3
): Promise<{ leaderboard: LeaderboardEntry[]; recentActivity: RecentActivityItem[] }> {
  const [tablesRes, missionsRes, completionsRes, approvedSubsRes] = await Promise.all([
    client
      .from('tables')
      .select('id,name,color,team_id,page_config,teams(id,name)')
      .eq('is_archived', false)
      .order('name'),
    client
      .from('missions')
      .select(
        'id,points,title,allow_multiple_submissions,max_submissions_per_table,points_per_submission,approval_mode,validation_type'
      )
      .order('title'),
    client.from('completions').select('id,table_id,mission_id,created_at'),
    client
      .from('mission_submissions')
      .select('id,table_id,mission_id,approved_at,submission_type,submission_data')
      .eq('status', 'approved'),
  ])

  if (tablesRes.error) throw new Error(tablesRes.error.message || 'Failed to load tables.')
  if (missionsRes.error) throw new Error(missionsRes.error.message || 'Failed to load missions.')
  if (completionsRes.error) throw new Error(completionsRes.error.message || 'Failed to load completions.')
  if (approvedSubsRes.error)
    throw new Error(approvedSubsRes.error.message || 'Failed to load approved submissions.')

  type TableWithTeamRow = TableRow & {
    page_config?: unknown
    teams?: { id: string; name: string } | { id: string; name: string }[] | null
  }

  const tablePageConfig = new Map<string, unknown>()
  for (const raw of tablesRes.data ?? []) {
    const row = raw as TableWithTeamRow
    tablePageConfig.set(row.id as string, row.page_config ?? null)
  }

  const tables = (tablesRes.data ?? []).map((t) => {
    const row = t as TableWithTeamRow
    return {
      id: row.id as string,
      name: row.name as string,
      color: (row.color as string | null) ?? null,
      team_id: (row.team_id as string | null) ?? null,
    }
  }) as TableRow[]

  const teamNameById = new Map<string, string>()
  for (const raw of tablesRes.data ?? []) {
    const row = raw as TableWithTeamRow
    const teamId = resolveTeamId({
      id: row.id as string,
      team_id: (row.team_id as string | null) ?? null,
    })
    const embedded = row.teams
    const teamRow = Array.isArray(embedded) ? embedded[0] : embedded
    const name = typeof teamRow?.name === 'string' ? teamRow.name.trim() : ''
    if (name) teamNameById.set(teamId, name)
    if (teamRow?.id && name) teamNameById.set(teamRow.id, name)
  }
  const missions = (missionsRes.data ?? []) as MissionRow[]
  const completions = (completionsRes.data ?? []) as CompletionRow[]
  const approvedSubs = (approvedSubsRes.data ?? []) as ApprovedSubmissionRow[]

  const oneTimeMissionPoints = new Map<string, number>()
  const repeatableMissionPoints = new Map<string, number>()
  const beatcoinMissionIds = new Set<string>()
  const missionTitle = new Map<string, string>()
  missions.forEach((m) => {
    if (m.validation_type === 'beatcoin') {
      beatcoinMissionIds.add(m.id)
      missionTitle.set(m.id, m.title ?? '—')
      return
    }
    if (
      isRepeatableAutoMission({
        approval_mode: m.approval_mode,
        max_submissions_per_table: m.max_submissions_per_table,
        allow_multiple_submissions: m.allow_multiple_submissions,
      })
    ) {
      repeatableMissionPoints.set(
        m.id,
        m.points_per_submission != null ? m.points_per_submission : m.points ?? 0
      )
    } else {
      oneTimeMissionPoints.set(m.id, m.points ?? 0)
    }
    missionTitle.set(m.id, m.title ?? '—')
  })

  const tableName = new Map<string, string>()
  const tableColor = new Map<string, string | null>()
  const physicalToTeamId = new Map<string, string>()
  tables.forEach((t) => {
    tableName.set(t.id, t.name)
    tableColor.set(t.id, t.color)
    physicalToTeamId.set(t.id, resolveTeamId(t))
  })

  const allMissionIds = new Set(missions.map((m) => m.id))
  const totalMissions = allMissionIds.size

  const tablesByTeam = groupTablesByTeamId(tables)
  const entries: LeaderboardEntry[] = [...tablesByTeam.entries()].map(([teamId, members]) => {
    const memberIds = new Set(members.map((m) => m.id))
    const primary = pickPrimaryTableForTeam(members, teamId)
    const tableCompletions = completions.filter((c) => memberIds.has(c.table_id))
    const completedMissionIds = new Set(
      tableCompletions.filter((c) => allMissionIds.has(c.mission_id)).map((c) => c.mission_id)
    )
    const completedCount = completedMissionIds.size
    const oneTimePoints = tableCompletions.reduce(
      (sum, c) => sum + (oneTimeMissionPoints.get(c.mission_id) ?? 0),
      0
    )
    const repeatablePoints = approvedSubs
      .filter((s) => memberIds.has(s.table_id))
      .reduce((sum, s) => {
        if (beatcoinMissionIds.has(s.mission_id)) {
          const raw = (s.submission_data as { points_awarded?: unknown } | null)?.points_awarded
          const n = typeof raw === 'number' ? raw : Number(raw)
          return sum + (Number.isFinite(n) ? n : 0)
        }
        if (repeatableMissionPoints.has(s.mission_id)) {
          return sum + (repeatableMissionPoints.get(s.mission_id) ?? 0)
        }
        return sum
      }, 0)
    const totalPoints = oneTimePoints + repeatablePoints
    const remainingCount = Math.max(0, totalMissions - completedCount)
    const teamName = teamNameById.get(teamId)?.trim() ?? ''
    const resolvedPage = resolveTeamPageConfig(tablePageConfig.get(primary.id) ?? null, {
      tableColor: primary.color,
      tableName: teamName,
    })
    const avatar_url = resolvedPage.hero.avatarImage.url?.trim() || null
    const logo_url = resolvedPage.hero.heroImage.url?.trim() || null
    return {
      teamId,
      teamName,
      teamColor: primary.color,
      totalPoints,
      completedCount,
      remainingCount,
      memberTableIds: members.map((m) => m.id),
      tableId: teamId,
      tableName: teamName,
      tableColor: primary.color,
      avatar_url,
      logo_url,
      image: avatar_url ?? logo_url,
    }
  })

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount
    return a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' })
  })

  const completionActivity = completions
    .filter((c) => oneTimeMissionPoints.has(c.mission_id))
    .map((c) => ({
      id: c.id,
      table_id: c.table_id,
      mission_id: c.mission_id,
      created_at: c.created_at,
      points: oneTimeMissionPoints.get(c.mission_id) ?? 0,
    }))
  const repeatableActivity = approvedSubs
    .filter((s) => !!s.approved_at)
    .filter(
      (s) =>
        beatcoinMissionIds.has(s.mission_id) || repeatableMissionPoints.has(s.mission_id)
    )
    .map((s) => {
      let pts = 0
      if (beatcoinMissionIds.has(s.mission_id)) {
        const raw = (s.submission_data as { points_awarded?: unknown } | null)?.points_awarded
        const n = typeof raw === 'number' ? raw : Number(raw)
        pts = Number.isFinite(n) ? n : 0
      } else {
        pts = repeatableMissionPoints.get(s.mission_id) ?? 0
      }
      return {
        id: `sub:${s.id}`,
        table_id: s.table_id,
        mission_id: s.mission_id,
        created_at: s.approved_at as string,
        points: pts,
      }
    })

  const sortedByTime = [...completionActivity, ...repeatableActivity].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const recentActivity: RecentActivityItem[] = sortedByTime.slice(0, recentLimit).map((c) => {
    const teamId = physicalToTeamId.get(c.table_id) ?? c.table_id
    const teamLabel =
      teamNameById.get(teamId)?.trim() ||
        teamNameById.get(physicalToTeamId.get(c.table_id) ?? '')?.trim() ||
        '—'
    const teamAccent = tableColor.get(teamId) ?? tableColor.get(c.table_id) ?? null
    return {
      id: c.id,
      tableId: teamId,
      tableName: teamLabel,
      tableColor: teamAccent,
      missionTitle: missionTitle.get(c.mission_id) ?? '—',
      points: c.points,
      createdAt: c.created_at,
    }
  })

  return { leaderboard: entries, recentActivity }
}

/** Recent scoring events across all teams (completions + approved submissions). */
export async function fetchRecentScoringActivity(
  recentLimit = 6
): Promise<RecentActivityItem[]> {
  const { recentActivity } = await fetchLeaderboardBundle(recentLimit)
  return recentActivity
}
