import { resolveTeamPageConfig } from '@/lib/team-page-config'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import type { GuestEmblemsSettingsValue } from '@/lib/guest-emblem-config'

type TableAvatarRow = {
  id?: string
  name?: string | null
  color?: string | null
  page_config?: unknown
  team_id?: string | null
  avatar_url?: string | null
  avatar?: string | null
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return null
}

/** Resolve avatar URL from table row columns and `page_config`. */
export function extractTableAvatarUrl(row: TableAvatarRow): string | null {
  const fromColumns = firstNonEmpty(
    typeof row.avatar_url === 'string' ? row.avatar_url : null,
    typeof row.avatar === 'string' ? row.avatar : null
  )
  if (fromColumns) return fromColumns

  const resolved = resolveTeamPageConfig(row.page_config ?? null, {
    tableColor: row.color ?? null,
    tableName: row.name ?? '',
  })
  return resolved.hero.avatarImage.url?.trim() || null
}

/** Map physical table ids and parent team ids to avatar URLs. */
export function buildTableAvatarMap(rows: TableAvatarRow[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) {
    const url = extractTableAvatarUrl(row)
    const id = row.id?.trim()
    if (!url || !id) continue
    map[id] = url
    const teamId = row.team_id?.trim()
    if (teamId && !map[teamId]) map[teamId] = url
  }
  return map
}

export function mergeLeaderboardAvatarsIntoMap(
  map: Record<string, string>,
  rows: LeaderboardEntry[]
): Record<string, string> {
  const next = { ...map }
  for (const row of rows) {
    const url = firstNonEmpty(row.avatar_url, row.logo_url, row.image)
    if (!url) continue
    const teamKey = row.teamId || row.tableId
    if (teamKey && !next[teamKey]) next[teamKey] = url
    for (const memberId of row.memberTableIds ?? []) {
      if (!next[memberId]) next[memberId] = url
    }
  }
  return next
}

export function resolveTeamAvatarUrl(
  teamKey: string,
  tableAvatars: Record<string, string>,
  guestEmblems: GuestEmblemsSettingsValue,
  leaderboardRow?: LeaderboardEntry | null
): string | null {
  const fromLeaderboard = leaderboardRow
    ? firstNonEmpty(leaderboardRow.avatar_url, leaderboardRow.logo_url, leaderboardRow.image)
    : null
  if (fromLeaderboard) return fromLeaderboard

  const memberIds = leaderboardRow?.memberTableIds ?? []
  const emblemMap = guestEmblems.team_emblem_by_table_id

  return (
    firstNonEmpty(
      tableAvatars[teamKey],
      ...memberIds.map((id) => tableAvatars[id]),
      emblemMap?.[teamKey],
      ...memberIds.map((id) => emblemMap?.[id])
    ) ?? null
  )
}
