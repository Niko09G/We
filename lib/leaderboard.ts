import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'

export type TableRow = { id: string; name: string; color: string | null }
/** Subset of missions schema for leaderboard (id, points, title for labels). */
export type MissionRow = Pick<MissionsTableRow, 'id' | 'points'> & { title?: string | null }
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
  const [tablesRes, missionsRes, completionsRes] = await Promise.all([
    supabase.from('tables').select('id,name,color').order('name'),
    supabase.from('missions').select('id,points').order('id'),
    supabase.from('completions').select('id,table_id,mission_id,created_at'),
  ])

  if (tablesRes.error) throw new Error(tablesRes.error.message || 'Failed to load tables.')
  if (missionsRes.error) throw new Error(missionsRes.error.message || 'Failed to load missions.')
  if (completionsRes.error) throw new Error(completionsRes.error.message || 'Failed to load completions.')

  const tables = (tablesRes.data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    color: ((t as { color?: string | null }).color as string | null) ?? null,
  })) as TableRow[]
  const missions = (missionsRes.data ?? []) as MissionRow[]
  const completions = (completionsRes.data ?? []) as CompletionRow[]

  const missionPoints = new Map<string, number>()
  missions.forEach((m) => missionPoints.set(m.id, m.points ?? 0))
  const allMissionIds = new Set(missions.map((m) => m.id))
  const totalMissions = allMissionIds.size

  const entries: LeaderboardEntry[] = tables.map((table) => {
    const tableCompletions = completions.filter((c) => c.table_id === table.id)
    const completedCount = tableCompletions.filter((c) =>
      allMissionIds.has(c.mission_id)
    ).length
    const totalPoints = tableCompletions.reduce(
      (sum, c) => sum + (missionPoints.get(c.mission_id) ?? 0),
      0
    )
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
  const [tablesRes, missionsRes, completionsRes] = await Promise.all([
    supabase.from('tables').select('id,name,color').order('name'),
    supabase.from('missions').select('id,points,title').order('title'),
    supabase.from('completions').select('id,table_id,mission_id,created_at'),
  ])

  if (tablesRes.error) throw new Error(tablesRes.error.message || 'Failed to load tables.')
  if (missionsRes.error) throw new Error(missionsRes.error.message || 'Failed to load missions.')
  if (completionsRes.error) throw new Error(completionsRes.error.message || 'Failed to load completions.')

  const tables = (tablesRes.data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    color: ((t as { color?: string | null }).color as string | null) ?? null,
  })) as TableRow[]
  const missions = (missionsRes.data ?? []) as MissionRow[]
  const completions = (completionsRes.data ?? []) as CompletionRow[]

  const missionPoints = new Map<string, number>()
  const missionTitle = new Map<string, string>()
  missions.forEach((m) => {
    missionPoints.set(m.id, m.points ?? 0)
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
    const totalPoints = tableCompletions.reduce(
      (sum, c) => sum + (missionPoints.get(c.mission_id) ?? 0),
      0
    )
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

  const sortedByTime = [...completions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const recentActivity: RecentActivityItem[] = sortedByTime.slice(0, recentLimit).map((c) => ({
    id: c.id,
    tableName: tableName.get(c.table_id) ?? '—',
    tableColor: tableColor.get(c.table_id) ?? null,
    missionTitle: missionTitle.get(c.mission_id) ?? '—',
    points: missionPoints.get(c.mission_id) ?? 0,
  }))

  return { leaderboard: entries, recentActivity }
}
