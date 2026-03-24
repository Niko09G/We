/**
 * Guest-facing emblem assets for team / rank HUD (mission overlay, future surfaces).
 * Stored in `app_settings` when wired — structure is forward-compatible for uploads.
 *
 * Example `app_settings` row (future migration):
 *   key: 'guest_emblems'
 *   value: {
 *     "team_emblem_by_table_id": { "<uuid>": "https://..." },
 *     "rank_emblems": [ { "min_rank": 1, "max_rank": 1, "emblem_url": "..." } ]
 *   }
 */

import { supabase } from '@/lib/supabase/client'

export const GUEST_EMBLEM_SETTINGS_KEY = 'guest_emblems' as const

/** Resolved per-session or per-table for the overlay; optional URLs show placeholders when null. */
export type GuestMissionHudEmblems = {
  /** Table / team crest (future upload). */
  teamEmblemUrl: string | null
  /** Rank tier or “next rank” emblem preview (future upload). */
  rankEmblemUrl: string | null
}

export const DEFAULT_GUEST_MISSION_HUD_EMBLEMS: GuestMissionHudEmblems = {
  teamEmblemUrl: null,
  rankEmblemUrl: null,
}

/** Raw JSON shape for `app_settings` (optional future use). */
export type GuestEmblemsSettingsValue = {
  team_emblem_by_table_id?: Record<string, string>
  rank_emblems?: Array<{
    min_rank: number
    max_rank: number
    emblem_url: string
  }>
}

/** Neutral placeholder until real emblem assets are uploaded (SVG data URL). */
export const GUEST_EMBLEM_PLACEHOLDER_DATA_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none">
      <rect width="80" height="80" rx="16" fill="white" fill-opacity="0.14"/>
      <path d="M40 18l12 9v14c0 10-6 18-12 24-6-6-12-14-12-24V27l12-9z" stroke="white" stroke-opacity="0.55" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="40" cy="38" r="5" fill="white" fill-opacity="0.35"/>
    </svg>`
  )

function cleanUrl(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseRankEmblems(value: unknown): Array<{
  min_rank: number
  max_rank: number
  emblem_url: string
}> {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      const r = row as Record<string, unknown>
      const min = Number(r.min_rank)
      const max = Number(r.max_rank)
      const url = cleanUrl(r.emblem_url)
      if (!Number.isFinite(min) || !Number.isFinite(max) || !url) return null
      return {
        min_rank: Math.max(1, Math.floor(min)),
        max_rank: Math.max(1, Math.floor(max)),
        emblem_url: url,
      }
    })
    .filter((row): row is { min_rank: number; max_rank: number; emblem_url: string } => Boolean(row))
}

export function parseGuestEmblems(value: unknown): GuestEmblemsSettingsValue {
  if (!value || typeof value !== 'object') return {}
  const o = value as Record<string, unknown>
  const teamMapRaw = o.team_emblem_by_table_id
  const teamMap: Record<string, string> = {}
  if (teamMapRaw && typeof teamMapRaw === 'object') {
    for (const [k, v] of Object.entries(teamMapRaw as Record<string, unknown>)) {
      const clean = cleanUrl(v)
      if (clean) teamMap[k] = clean
    }
  }
  return {
    team_emblem_by_table_id: teamMap,
    rank_emblems: parseRankEmblems(o.rank_emblems),
  }
}

export function resolveRankEmblemUrl(
  settings: GuestEmblemsSettingsValue,
  rank: number | null
): string | null {
  if (rank == null || !Number.isFinite(rank) || rank < 1) return null
  const rows = settings.rank_emblems ?? []
  for (const row of rows) {
    if (rank >= row.min_rank && rank <= row.max_rank) return row.emblem_url
  }
  return null
}

export async function fetchGuestEmblemsConfig(): Promise<GuestEmblemsSettingsValue> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', GUEST_EMBLEM_SETTINGS_KEY)
    .maybeSingle()
  if (error) throw new Error(error.message || 'Failed to load emblem settings.')
  return parseGuestEmblems((data as { value: unknown } | null)?.value)
}

export async function setGuestEmblemsConfig(value: GuestEmblemsSettingsValue): Promise<void> {
  const payload: GuestEmblemsSettingsValue = {
    team_emblem_by_table_id: value.team_emblem_by_table_id ?? {},
    rank_emblems: parseRankEmblems(value.rank_emblems ?? []),
  }
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: GUEST_EMBLEM_SETTINGS_KEY,
        value: payload,
      },
      { onConflict: 'key' }
    )
  if (error) throw new Error(error.message || 'Failed to save emblem settings.')
}
