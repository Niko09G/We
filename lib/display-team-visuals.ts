import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveTeamPageConfig, type ResolvedTeamPageConfig } from '@/lib/team-page-config'

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
    .select('id, name, color, page_config')
    .in('id', tableIds)

  if (error || !data) return {}

  const out: Record<string, DisplayTeamVisual> = {}
  for (const row of data) {
    const id = row.id as string
    const resolved = resolveTeamPageConfig(row.page_config, {
      tableColor: (row as { color?: string | null }).color ?? null,
      tableName: row.name as string,
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
