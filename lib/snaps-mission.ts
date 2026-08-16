import type { SupabaseClient } from '@supabase/supabase-js'
import { displayVisualFromConfig } from '@/lib/display-team-visuals'
import { resolveTeamPageConfig } from '@/lib/team-page-config'
import {
  SNAPS_MISSION_TITLE,
  SNAPS_SHOT_POINTS,
  type SnapsTeam,
} from '@/lib/snaps'

type TableVisualRow = {
  id: string
  name: string
  color: string | null
  page_config: unknown
}

const SNAPS_MISSION_PATCH = {
  approval_mode: 'auto',
  allow_multiple_submissions: true,
  max_submissions_per_table: null,
  points: SNAPS_SHOT_POINTS,
  points_per_submission: SNAPS_SHOT_POINTS,
  add_to_greetings: false,
  message_required: false,
} as const

export function mapTableToSnapsTeam(row: TableVisualRow): SnapsTeam {
  const resolved = resolveTeamPageConfig(row.page_config, {
    tableColor: row.color,
    tableName: row.name,
  })
  const visual = displayVisualFromConfig(resolved)
  return {
    id: row.id,
    name: row.name,
    color: row.color?.trim() || visual.primaryColor || '#71717a',
    heroGradientCss: visual.heroGradientCss || visual.gradientCss,
    heroImageUrl: resolved.hero.heroImage.url?.trim() || null,
    avatarUrl: resolved.hero.avatarImage.url?.trim() || null,
  }
}

export async function loadSnapsTeamById(
  supabase: SupabaseClient,
  tableId: string
): Promise<SnapsTeam | null> {
  const { data, error } = await supabase
    .from('tables')
    .select('id,name,color,page_config,is_active,is_archived')
    .eq('id', tableId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as TableVisualRow & { is_active?: boolean; is_archived?: boolean }
  if (row.is_archived === true) return null
  if (row.is_active === false) return null
  return mapTableToSnapsTeam(row)
}

/**
 * Find or create the dedicated repeatable "Snaps" mission so +5 awards
 * count on the main leaderboard via approved mission_submissions.
 */
export async function ensureSnapsMissionId(supabase: SupabaseClient): Promise<string> {
  const envId = process.env.SNAPS_MISSION_ID?.trim()
  if (envId) {
    const { data, error } = await supabase
      .from('missions')
      .select('id')
      .eq('id', envId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.id) {
      await ensureSnapsMissionScoringConfig(supabase, String(data.id))
      return String(data.id)
    }
  }

  const { data: listed, error: listErr } = await supabase
    .from('missions')
    .select('id,title')
    .order('created_at', { ascending: true })
    .limit(200)
  if (listErr) throw new Error(listErr.message)

  const existing = (listed ?? []).find(
    (row) => String((row as { title?: string }).title ?? '').trim().toLowerCase() === 'snaps'
  )
  if (existing?.id) {
    await ensureSnapsMissionScoringConfig(supabase, String(existing.id))
    return String(existing.id)
  }

  const { data: created, error: createErr } = await supabase
    .from('missions')
    .insert({
      title: SNAPS_MISSION_TITLE,
      description: 'Bar shots awarded by the Snaps host. Repeatable +5 BeatCoins.',
      validation_type: 'text',
      is_active: true,
      ...SNAPS_MISSION_PATCH,
    })
    .select('id')
    .single()

  if (createErr) throw new Error(createErr.message || 'Failed to create Snaps mission.')
  return String((created as { id: string }).id)
}

async function ensureSnapsMissionScoringConfig(
  supabase: SupabaseClient,
  missionId: string
): Promise<void> {
  const { error } = await supabase
    .from('missions')
    .update({ ...SNAPS_MISSION_PATCH })
    .eq('id', missionId)
  if (error) throw new Error(error.message || 'Failed to configure Snaps mission.')
}
