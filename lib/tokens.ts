/**
 * Beatcoin token redemption helpers.
 * Redemptions are stored in public.token_redemptions (see token_redemptions_per_table.sql).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const TOKEN_REDEMPTIONS_TABLE = 'token_redemptions' as const

export const TOKEN_REDEMPTIONS_MIGRATION = 'supabase/schema/token_redemptions_per_table.sql'
export const TOKEN_REDEMPTIONS_LOOKUP_MIGRATION = 'supabase/schema/beatcoin_token_lookup_fix.sql'

type SupabaseErrorLike = { message?: string; code?: string } | null | undefined

type BeatcoinTokenRowLike = {
  id?: string
  token?: string
}

/** RPC args for claim_beatcoin — p_token is text; p_table_id must be a UUID string. */
export function buildClaimBeatcoinRpcArgs(token: string, tableId: string) {
  return {
    p_token: String(token).trim(),
    p_table_id: String(tableId).trim().toLowerCase(),
  } as const
}

/**
 * Resolve QR / URL input to the opaque `beatcoin_tokens.token` text value.
 * Avoids passing UUID-shaped strings into token-column lookups inside claim RPCs.
 */
export async function resolveBeatcoinTokenForClaim(
  supabase: SupabaseClient,
  rawToken: string
): Promise<string> {
  const normalized = String(rawToken).trim()
  if (!normalized) return ''

  const { data, error } = await supabase.rpc('resolve_beatcoin_token_row', {
    p_token: normalized,
  })

  if (!error && data && typeof data === 'object') {
    const row = data as BeatcoinTokenRowLike
    const tokenValue = typeof row.token === 'string' ? row.token.trim() : ''
    if (tokenValue) return tokenValue
  }

  return normalized
}

/** True when Postgres rejects a text/uuid comparison (e.g. querying id with a raw token string). */
export function isPostgresUuidTextMismatchError(error: SupabaseErrorLike): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return (
    msg.includes('operator does not exist') &&
    (msg.includes('text = uuid') || msg.includes('uuid = text'))
  )
}

/** True when claim/peek RPCs fail because token_redemptions (or updated RPCs) are not deployed. */
export function isTokenRedemptionMigrationError(error: SupabaseErrorLike): boolean {
  if (!error) return false

  const msg = (error.message ?? '').toLowerCase()

  if (error.code === 'PGRST202') {
    return true
  }

  if (
    msg.includes(TOKEN_REDEMPTIONS_TABLE) &&
    (msg.includes('does not exist') || msg.includes('schema cache'))
  ) {
    return true
  }

  if (
    (msg.includes('claim_beatcoin') ||
      msg.includes('peek_beatcoin') ||
      msg.includes('resolve_beatcoin_token_row')) &&
    (msg.includes('does not exist') || msg.includes('schema cache'))
  ) {
    return true
  }

  if (isPostgresUuidTextMismatchError(error)) {
    return true
  }

  return false
}

export function tokenRedemptionMigrationMessage(): string {
  return `Token redemption schema not deployed. Run ${TOKEN_REDEMPTIONS_MIGRATION} and ${TOKEN_REDEMPTIONS_LOOKUP_MIGRATION} in the Supabase SQL Editor, then retry.`
}
