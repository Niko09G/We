/**
 * Beatcoin token redemption helpers.
 * Redemptions are stored in public.token_redemptions (see token_redemptions_per_table.sql).
 */

export const TOKEN_REDEMPTIONS_TABLE = 'token_redemptions' as const

export const TOKEN_REDEMPTIONS_MIGRATION = 'supabase/schema/token_redemptions_per_table.sql'
export const TOKEN_REDEMPTIONS_LOOKUP_MIGRATION = 'supabase/schema/beatcoin_token_lookup_fix.sql'

type SupabaseErrorLike = { message?: string; code?: string } | null | undefined

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
    (msg.includes('claim_beatcoin') || msg.includes('peek_beatcoin')) &&
    (msg.includes('does not exist') || msg.includes('schema cache'))
  ) {
    return true
  }

  return false
}

export function tokenRedemptionMigrationMessage(): string {
  return `Token redemption schema not deployed. Run ${TOKEN_REDEMPTIONS_MIGRATION} and ${TOKEN_REDEMPTIONS_LOOKUP_MIGRATION} in the Supabase SQL Editor, then retry.`
}
