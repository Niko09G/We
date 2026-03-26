/**
 * Event-wide reward unit (display only). Stored in `app_settings` key `reward_unit`.
 * Mission/token `points` columns remain numeric amounts of this unit.
 */

import { supabase } from '@/lib/supabase/client'

export const REWARD_UNIT_SETTINGS_KEY = 'reward_unit' as const

export type RewardUnitConfig = {
  /** Primary display name, e.g. "BeatCoin" */
  name: string
  /** Compact label for tight UI (optional), e.g. "BC" */
  short_label: string | null
  /** Main icon URL used by static UI surfaces. */
  icon_main_url: string | null
  /** Optional alternate icon URLs for animation sprites (different angles). */
  icon_alt_urls: string[]
}

/** Default when row missing or invalid (white-label by changing DB + admin). */
export const DEFAULT_REWARD_UNIT: RewardUnitConfig = {
  name: 'Reward',
  short_label: null,
  icon_main_url: null,
  icon_alt_urls: [],
}

/** Legacy emoji fallback; UI uses an SVG coin so Montserrat-only stacks still show a mark. */
export const REWARD_UNIT_FALLBACK_EMOJI = '🪙' as const

function cleanUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return t || null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const t = String(value).trim()
    return t || null
  }
  return null
}

/** Backward-compatible parser for legacy `icon_url` and new asset shape. */
function parseRewardIconAssets(value: Record<string, unknown>): {
  icon_main_url: string | null
  icon_alt_urls: string[]
} {
  const icon_main_url = cleanUrl(value.icon_main_url) ?? cleanUrl(value.icon_url)
  const fromArray = Array.isArray(value.icon_alt_urls) ? value.icon_alt_urls : []
  const fromFlat = [value.icon_alt_1_url, value.icon_alt_2_url, value.icon_alt_3_url]
  const icon_alt_urls = [...fromArray, ...fromFlat]
    .map((u) => cleanUrl(u))
    .filter((u): u is string => Boolean(u))
  return { icon_main_url, icon_alt_urls }
}

export function parseRewardUnit(value: unknown): RewardUnitConfig {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return DEFAULT_REWARD_UNIT
    try {
      return parseRewardUnit(JSON.parse(trimmed) as unknown)
    } catch {
      return DEFAULT_REWARD_UNIT
    }
  }
  if (value == null || typeof value !== 'object') return DEFAULT_REWARD_UNIT
  const o = value as Record<string, unknown>
  const nameRaw = o.name
  const name =
    typeof nameRaw === 'string' && nameRaw.trim()
      ? nameRaw.trim()
      : DEFAULT_REWARD_UNIT.name
  const sl = o.short_label
  const short_label =
    typeof sl === 'string' && sl.trim() ? sl.trim() : null
  const { icon_main_url, icon_alt_urls } = parseRewardIconAssets(o)
  return { name, short_label, icon_main_url, icon_alt_urls }
}

export function rewardUnitCompactLabel(config: RewardUnitConfig): string {
  return config.short_label?.trim() || config.name
}

/** Static UI should always use this image URL only. */
export function rewardUnitMainIconUrl(config: RewardUnitConfig): string | null {
  return cleanUrl(config.icon_main_url)
}

/** Animation-only icon variants (non-empty, de-duped, excludes main). */
export function rewardUnitAnimationAltIconUrls(config: RewardUnitConfig): string[] {
  const main = rewardUnitMainIconUrl(config)
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of config.icon_alt_urls) {
    const url = cleanUrl(raw)
    if (!url || url === main || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/** Helper for animation systems: one call for main + alternates. */
export function rewardUnitSpriteSet(config: RewardUnitConfig): {
  mainIconUrl: string | null
  alternateIconUrls: string[]
} {
  return {
    mainIconUrl: rewardUnitMainIconUrl(config),
    alternateIconUrls: rewardUnitAnimationAltIconUrls(config),
  }
}

export async function fetchRewardUnitConfig(): Promise<RewardUnitConfig> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', REWARD_UNIT_SETTINGS_KEY)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to load reward unit.')
  return parseRewardUnit((data as { value: unknown } | null)?.value)
}

export async function setRewardUnitConfig(config: RewardUnitConfig): Promise<void> {
  const alt = config.icon_alt_urls
    .map((u) => cleanUrl(u))
    .filter((u): u is string => Boolean(u))
    .slice(0, 3)
  const row = {
    name: config.name.trim() || DEFAULT_REWARD_UNIT.name,
    short_label: config.short_label?.trim() || null,
    icon_main_url: cleanUrl(config.icon_main_url),
    icon_alt_urls: alt,
  }
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: REWARD_UNIT_SETTINGS_KEY,
        value: row,
      },
      { onConflict: 'key' }
    )

  if (error) throw new Error(error.message || 'Failed to save reward unit.')
}
