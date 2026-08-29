/**
 * Client-safe helpers for token claim URLs and Beatcoin lookup/claim APIs.
 */

/** Build the path segment for a token (caller should encodeURIComponent when embedding in URLs). */
export function tokenClaimPath(token: string): string {
  const t = token.trim()
  return `/claim/${encodeURIComponent(t)}`
}

/** Full claim URL using the current origin (browser only). */
export function tokenClaimUrl(token: string): string {
  if (typeof window === 'undefined') return tokenClaimPath(token)
  return `${window.location.origin}${tokenClaimPath(token)}`
}

export type BeatcoinLookupOk = {
  ok: true
  points: number
  mission_id: string
  /** True when `table_id` was provided and that table already redeemed this token. */
  already_claimed: boolean
}

export type BeatcoinLookupErr = {
  ok: false
  error: string
}

export type BeatcoinLookupResponse = BeatcoinLookupOk | BeatcoinLookupErr

export type BeatcoinClaimOk = {
  ok: true
  points: number
  mission_submission_id?: string
}

export type BeatcoinClaimErr = {
  ok: false
  error: string
}

export type BeatcoinClaimResponse = BeatcoinClaimOk | BeatcoinClaimErr

/** Public lookup: resolve QR token → points + per-table claim status. */
export async function lookupBeatcoinToken(
  token: string,
  tableId?: string
): Promise<BeatcoinLookupResponse> {
  const params = new URLSearchParams({ token: token.trim() })
  if (tableId?.trim()) params.set('table_id', tableId.trim())
  const res = await fetch(`/api/beatcoins/lookup?${params}`)
  return (await res.json()) as BeatcoinLookupResponse
}

/** Public claim: award BeatCoins to a table for a token (one redemption per table). */
export async function claimBeatcoinToken(
  token: string,
  tableId: string
): Promise<BeatcoinClaimResponse> {
  const res = await fetch('/api/beatcoins/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.trim(), table_id: tableId.trim() }),
  })
  return (await res.json()) as BeatcoinClaimResponse
}
