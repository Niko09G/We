import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveTeamPageConfig, type ResolvedTeamPageConfig } from '@/lib/team-page-config'
import { groupTablesByTeamId, pickPrimaryTableForTeam } from '@/lib/table-teams'

export type DisplayTeamVisual = {
  avatarUrl: string | null
  heroImageUrl: string | null
  gradientCss: string
  heroGradientCss: string
  primaryColor: string
}

export function gradientCssFromStop(top: string, bottom: string): string {
  return `linear-gradient(to bottom, ${top}, ${bottom})`
}

export function displayVisualFromConfig(
  config: ResolvedTeamPageConfig
): Omit<DisplayTeamVisual, 'avatarUrl' | 'heroImageUrl'> {
  const lb = config.theme.leaderboardGradient
  const hero = config.hero.backgroundGradient
  return {
    gradientCss: gradientCssFromStop(lb.colorTop, lb.colorBottom),
    heroGradientCss: hero.colorMiddle
      ? `linear-gradient(to bottom, ${hero.colorTop}, ${hero.colorMiddle}, ${hero.colorBottom})`
      : gradientCssFromStop(hero.colorTop, hero.colorBottom),
    primaryColor: config.theme.primaryColor,
  }
}

export async function fetchDisplayTeamVisuals(
  client: SupabaseClient,
  tableIds: string[]
): Promise<Record<string, DisplayTeamVisual>> {
  if (tableIds.length === 0) return {}

  const { data, error } = await client
    .from('tables')
    .select('id, name, color, page_config, team_id')
    .eq('is_archived', false)

  if (error || !data) return {}

  const wanted = new Set(tableIds)
  const rows = data as Array<{
    id: string
    name: string
    color: string | null
    page_config: unknown
    team_id: string | null
  }>

  const byKey = new Map<string, (typeof rows)[number]>()
  for (const [teamId, members] of groupTablesByTeamId(rows)) {
    const primary = pickPrimaryTableForTeam(members, teamId)
    byKey.set(teamId, primary)
    for (const member of members) {
      if (wanted.has(member.id)) byKey.set(member.id, primary)
    }
  }
  for (const id of tableIds) {
    if (!byKey.has(id)) {
      const row = rows.find((r) => r.id === id)
      if (row) byKey.set(id, row)
    }
  }

  const out: Record<string, DisplayTeamVisual> = {}
  for (const id of tableIds) {
    const row = byKey.get(id)
    if (!row) continue
    const resolved = resolveTeamPageConfig(row.page_config, {
      tableColor: row.color ?? null,
      tableName: row.name,
    })
    const base = displayVisualFromConfig(resolved)
    out[id] = {
      ...base,
      avatarUrl: resolved.hero.avatarImage.url?.trim() || null,
      heroImageUrl: resolved.hero.heroImage.url?.trim() || null,
    }
  }
  return out
}
