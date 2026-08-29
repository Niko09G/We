/** Physical `tables` rows can share one logical `team_id` (parent team). */

export type TableTeamRef = {
  id: string
  team_id?: string | null
  name?: string
  display_order?: number
}

export function resolveTeamId(table: TableTeamRef): string {
  const tid = typeof table.team_id === 'string' ? table.team_id.trim() : ''
  return tid || table.id
}

/** Parent team id used for mission progress, completions, and point credit. */
export function resolveCreditTableId(table: TableTeamRef): string {
  return resolveTeamId(table)
}

/** Physical table ids whose mission progress rolls up to one team (includes credit id). */
export function tableIdsInTeamScope(creditTableId: string, all: TableTeamRef[]): string[] {
  const ids = new Set<string>()
  const credit = creditTableId.trim()
  if (!credit) return []
  ids.add(credit)
  for (const table of all) {
    if (resolveTeamId(table) === credit) ids.add(table.id)
  }
  return [...ids]
}

export function groupTablesByTeamId<T extends TableTeamRef>(tables: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const table of tables) {
    const teamId = resolveTeamId(table)
    const list = grouped.get(teamId) ?? []
    list.push(table)
    grouped.set(teamId, list)
  }
  return grouped
}

/** Canonical physical table for a team: the row whose id equals team_id, else lowest display_order. */
export function pickPrimaryTableForTeam<T extends TableTeamRef>(members: T[], teamId: string): T {
  const exact = members.find((t) => t.id === teamId)
  if (exact) return exact
  const sorted = [...members].sort((a, b) => {
    const d = (a.display_order ?? 0) - (b.display_order ?? 0)
    if (d !== 0) return d
    return (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' })
  })
  return sorted[0]!
}

export type LobbyParentTeamInput = {
  id: string
  name: string
  color?: string | null
  sort_order?: number
}

export type LobbyPhysicalTable = TableTeamRef & {
  name: string
  color: string | null
  page_config: unknown
  is_active?: boolean
}

export type LobbyTeamCardRow = {
  /** Primary physical table id — used for `/missions/[tableId]` links. */
  id: string
  /** Parent team id for stable keys and deduping. */
  teamId: string
  name: string
  color: string | null
  page_config: unknown
}

/** One lobby card per parent team; visuals from the canonical physical table row. */
export function lobbyRowsFromParentTeams(
  teams: LobbyParentTeamInput[],
  physicalTables: LobbyPhysicalTable[]
): LobbyTeamCardRow[] {
  const active = physicalTables.filter((t) => (t.is_active ?? true) !== false)
  const grouped = groupTablesByTeamId(active)
  const rows: LobbyTeamCardRow[] = []
  const seen = new Set<string>()

  const sortedTeams = [...teams].sort((a, b) => {
    const d = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (d !== 0) return d
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  for (const team of sortedTeams) {
    const members = grouped.get(team.id)
    if (!members?.length) continue
    const teamName = team.name.trim()
    if (!teamName) continue
    seen.add(team.id)
    const primary = pickPrimaryTableForTeam(members, team.id)
    const canonical = members.find((m) => m.id === team.id) ?? primary
    const teamColor = (team.color ?? '').trim() || canonical.color
    rows.push({
      id: primary.id,
      teamId: team.id,
      name: teamName,
      color: teamColor,
      page_config: canonical.page_config,
    })
  }

  const fallback: LobbyTeamCardRow[] = []
  for (const [teamId, members] of grouped) {
    if (seen.has(teamId)) continue
    const primary = pickPrimaryTableForTeam(members, teamId)
    fallback.push({
      id: primary.id,
      teamId,
      name: primary.name,
      color: primary.color,
      page_config: primary.page_config,
    })
  }
  fallback.sort((a, b) => {
    const aOrder = active.find((t) => t.id === a.id)?.display_order ?? 0
    const bOrder = active.find((t) => t.id === b.id)?.display_order ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return [...rows, ...fallback]
}

/** One representative table per team, ordered for lobby / mission pickers. */
export function canonicalTablesForLobby<T extends TableTeamRef>(tables: T[]): T[] {
  const grouped = groupTablesByTeamId(tables)
  const primaries: T[] = []
  for (const [teamId, members] of grouped) {
    primaries.push(pickPrimaryTableForTeam(members, teamId))
  }
  primaries.sort((a, b) => {
    const d = (a.display_order ?? 0) - (b.display_order ?? 0)
    if (d !== 0) return d
    return (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' })
  })
  return primaries
}

export function leaderboardEntryIncludesTable(
  entry: { tableId: string; teamId?: string; memberTableIds?: string[] },
  physicalTableId: string
): boolean {
  const teamKey = entry.teamId?.trim() || entry.tableId
  if (teamKey === physicalTableId) return true
  return (entry.memberTableIds ?? []).includes(physicalTableId)
}

export function teamSiblingCount(
  table: TableTeamRef & { is_archived?: boolean },
  all: Array<TableTeamRef & { is_archived?: boolean }>
): number {
  const teamId = resolveTeamId(table)
  return all.filter((t) => !t.is_archived && resolveTeamId(t) === teamId).length
}

export function teamHasSiblingBlocks(
  table: TableTeamRef & { is_archived?: boolean },
  all: Array<TableTeamRef & { is_archived?: boolean }>
): boolean {
  return teamSiblingCount(table, all) > 1
}

export function physicalTableAdminLabel(
  table: { id: string; name: string; team_id?: string | null; team_name?: string | null },
  all: Array<{ id: string; team_id?: string | null; is_archived?: boolean }>
): string {
  const teamName = table.team_name?.trim()
  if (
    teamHasSiblingBlocks(table, all) &&
    teamName &&
    teamName.toLowerCase() !== table.name.trim().toLowerCase()
  ) {
    return `${teamName} · ${table.name}`
  }
  return table.name
}
