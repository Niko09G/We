/**
 * Beatcoin token redemption helpers.
 * Redemptions are stored in public.token_redemptions (see token_redemptions_per_table.sql).
 */

import { isBeatcoinTokenUuid } from '@/lib/admin-tokens'
import type { SupabaseClient } from '@supabase/supabase-js'

export const TOKEN_REDEMPTIONS_TABLE = 'token_redemptions' as const

export type BeatcoinTokenRow = {
  id: string
  token: string
  points: number
  mission_id: string
}

/**
 * Resolve QR / URL input to a beatcoin_tokens row (direct table query).
 * Matches case-insensitively on token text; falls back to row id when input is a UUID.
 */
export async function lookupBeatcoinTokenRow(
  supabase: SupabaseClient,
  rawToken: string
): Promise<BeatcoinTokenRow | null> {
  const normalized = String(rawToken).trim()
  if (!normalized) return null

  const { data: byExact, error: exactErr } = await supabase
    .from('beatcoin_tokens')
    .select('id, token, points, mission_id')
    .eq('token', normalized)
    .maybeSingle()

  if (exactErr) throw new Error(exactErr.message)
  if (byExact) return byExact as BeatcoinTokenRow

  const { data: byIlike, error: ilikeErr } = await supabase
    .from('beatcoin_tokens')
    .select('id, token, points, mission_id')
    .ilike('token', normalized)
    .limit(1)
    .maybeSingle()

  if (ilikeErr) throw new Error(ilikeErr.message)
  if (byIlike) return byIlike as BeatcoinTokenRow

  if (isBeatcoinTokenUuid(normalized)) {
    const { data: byId, error: idErr } = await supabase
      .from('beatcoin_tokens')
      .select('id, token, points, mission_id')
      .eq('id', normalized.toLowerCase())
      .maybeSingle()

    if (idErr) throw new Error(idErr.message)
    if (byId) return byId as BeatcoinTokenRow
  }

  return null
}
