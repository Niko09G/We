import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'

export type TableRow = { id: string; name: string; color: string | null }
/** Subset of missions schema for leaderboard (id, points, title for labels). */
export type MissionRow = Pick<
  MissionsTableRow,
  'id' | 'points' | 'allow_multiple_submissions' | 'points_per_submission' | 'approval_mode'
> & { title?: string | null }
export type CompletionRow = {
  id: string
  table_id: string
  mission_id: string
  created_at: string
}

export type RecentActivityItem = {
  id: string
  tableName: string
  tableColor: string | null
  missionTitle: string
  points: number
}

type ApprovedSubmissionRow = {
  id: string
  table_id: string
  mission_id: string
  approved_at: string | null
}

export type LeaderboardEntry = {
  tableId: string
  tableName: string
  /** Hex like #3b82f6; null → neutral dot on display */
  tableColor: string | null
  totalPoints: number
  completedCount: number
  remainingCount: number
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const [tablesRes, missionsRes, completionsRes, approvedSubsRes] = await Promise.all([
    supabase.from('tables').select('id,name,color').eq('is_archived', false).order('name'),
    supabase
      .from('missions')
      .select('id,points,allow_multiple_submissions,points_per_submission,approval_mode')
      .order('id'),
    supabase.from('completions').select('id,table_id,mission_id,created_at'),
    supabase
      .from('mission_submissions')
      .select('id,table_id,mission_id,approved_at')
      .eq('status', 'approved'),
  ])

  if (tablesRes.error) throw new Error(tablesRes.error.message || 'Failed to load tables.')
  if (missionsRes.error) throw new Error(missionsRes.error.message || 'Failed to load missions.')
  if (completionsRes.error) throw new Error(completionsRes.error.message || 'Failed to load completions.')
  if (approvedSubsRes.error)
    throw new Error(approvedSubsRes.error.message || 'Failed to load approved submissions.')

  const tables = (tablesRes.data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    color: ((t as { color?: string | null }).color as string | null) ?? null,
  })) as TableRow[]
  const missions = (missionsRes.data ?? []) as MissionRow[]
  const completions = (completionsRes.data ?? []) as CompletionRow[]
  const approvedSubs = (approvedSubsRes.data ?? []) as ApprovedSubmissionRow[]

  const oneTimeMissionPoints = new Map<string, number>()
  const repeatableMissionPoints = new Map<string, number>()
  missions.forEach((m) => {
    const allowMultiple = (m.allow_multiple_submissions ?? false) === true
    const isAuto = (m.approval_mode ?? 'manual') === 'auto'
    if (allowMultiple && isAuto) {
      repeatableMissionPoints.set(
        m.id,
        m.points_per_submission != null ? m.points_per_submission : m.points ?? 0
      )
    } else {
      oneTimeMissionPoints.set(m.id, m.points ?? 0)
    }
  })
  const allMissionIds = new Set(missions.map((m) => m.id))
  const totalMissions = allMissionIds.size

  const entries: LeaderboardEntry[] = tables.map((table) => {
    const tableCompletions = completions.filter((c) => c.table_id === table.id)
    const completedCount = tableCompletions.filter((c) =>
      allMissionIds.has(c.mission_id)
    ).length
    const oneTimePoints = tableCompletions.reduce(
      (sum, c) => sum + (oneTimeMissionPoints.get(c.mission_id) ?? 0),
      0
    )
    const repeatablePoints = approvedSubs
      .filter((s) => s.table_id === table.id && repeatableMissionPoints.has(s.mission_id))
      .reduce((sum, s) => sum + (repeatableMissionPoints.get(s.mission_id) ?? 0), 0)
    const totalPoints = oneTimePoints + repeatablePoints
    const remainingCount = Math.max(0, totalMissions - completedCount)
    return {
      tableId: table.id,
      tableName: table.name,
      tableColor: table.color,
      totalPoints,
      completedCount,
      remainingCount,
    }
  })

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount
    return a.tableName.localeCompare(b.tableName, undefined, { sensitivity: 'base' })
  })
  return entries
}

/** Leaderboard + last N completions (single fetch). */
export async function fetchLeaderboardBundle(
  recentLimit = 3
): Promise<{ leaderboard: LeaderboardEntry[]; recentActivity: RecentActivityItem[] }> {
  const [tablesRes, missionsRes, completionsRes, approvedSubsRes] = await Promise.all([
    supabase.from('tables').select('id,name,color').eq('is_archived', false).order('name'),
    supabase
      .from('missions')
      .select('id,points,title,allow_multiple_submissions,points_per_submission,approval_mode')
      .order('title'),
    supabase.from('completions').select('id,table_id,mission_id,created_at'),
    supabase
      .from('mission_submissions')
      .select('id,table_id,mission_id,approved_at')
      .eq('status', 'approved'),
  ])

  if (tablesRes.error) throw new Error(tablesRes.error.message || 'Failed to load tables.')
  if (missionsRes.error) throw new Error(missionsRes.error.message || 'Failed to load missions.')
  if (completionsRes.error) throw new Error(completionsRes.error.message || 'Failed to load completions.')
  if (approvedSubsRes.error)
    throw new Error(approvedSubsRes.error.message || 'Failed to load approved submissions.')

  const tables = (tablesRes.data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    color: ((t as { color?: string | null }).color as string | null) ?? null,
  })) as TableRow[]
  const missions = (missionsRes.data ?? []) as MissionRow[]
  const completions = (completionsRes.data ?? []) as CompletionRow[]
  const approvedSubs = (approvedSubsRes.data ?? []) as ApprovedSubmissionRow[]

  const oneTimeMissionPoints = new Map<string, number>()
  const repeatableMissionPoints = new Map<string, number>()
  const missionTitle = new Map<string, string>()
  missions.forEach((m) => {
    const allowMultiple = (m.allow_multiple_submissions ?? false) === true
    const isAuto = (m.approval_mode ?? 'manual') === 'auto'
    if (allowMultiple && isAuto) {
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
  tables.forEach((t) => {
    tableName.set(t.id, t.name)
    tableColor.set(t.id, t.color)
  })

  const allMissionIds = new Set(missions.map((m) => m.id))
  const totalMissions = allMissionIds.size

  const entries: LeaderboardEntry[] = tables.map((table) => {
    const tableCompletions = completions.filter((c) => c.table_id === table.id)
    const completedCount = tableCompletions.filter((c) =>
      allMissionIds.has(c.mission_id)
    ).length
    const oneTimePoints = tableCompletions.reduce(
      (sum, c) => sum + (oneTimeMissionPoints.get(c.mission_id) ?? 0),
      0
    )
    const repeatablePoints = approvedSubs
      .filter((s) => s.table_id === table.id && repeatableMissionPoints.has(s.mission_id))
      .reduce((sum, s) => sum + (repeatableMissionPoints.get(s.mission_id) ?? 0), 0)
    const totalPoints = oneTimePoints + repeatablePoints
    const remainingCount = Math.max(0, totalMissions - completedCount)
    return {
      tableId: table.id,
      tableName: table.name,
      tableColor: table.color,
      totalPoints,
      completedCount,
      remainingCount,
    }
  })

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount
    return a.tableName.localeCompare(b.tableName, undefined, { sensitivity: 'base' })
  })

  const completionActivity = completions.map((c) => ({
    id: c.id,
    table_id: c.table_id,
    mission_id: c.mission_id,
    created_at: c.created_at,
    points: oneTimeMissionPoints.get(c.mission_id) ?? 0,
  }))
  const repeatableActivity = approvedSubs
    .filter((s) => repeatableMissionPoints.has(s.mission_id) && !!s.approved_at)
    .map((s) => ({
      id: `sub:${s.id}`,
      table_id: s.table_id,
      mission_id: s.mission_id,
      created_at: s.approved_at as string,
      points: repeatableMissionPoints.get(s.mission_id) ?? 0,
    }))

  const sortedByTime = [...completionActivity, ...repeatableActivity].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const recentActivity: RecentActivityItem[] = sortedByTime.slice(0, recentLimit).map((c) => ({
    id: c.id,
    tableName: tableName.get(c.table_id) ?? '—',
    tableColor: tableColor.get(c.table_id) ?? null,
    missionTitle: missionTitle.get(c.mission_id) ?? '—',
    points: c.points,
  }))

  return { leaderboard: entries, recentActivity }
}
