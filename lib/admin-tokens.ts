/**
 * Client-safe helpers for token claim URLs and Beatcoin lookup/claim APIs.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** True when the value looks like a beatcoin_tokens row id. */
export function isBeatcoinTokenUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

/**
 * Normalize a raw token from a URL path, query string, or QR payload.
 * Handles trimming, URI decoding (including double-encoded), and stray query/hash suffixes.
 */
export function normalizeClaimTokenInput(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''

  const claimPathMatch = s.match(/^\/?claim\/([^/?#]+)/i)
  if (claimPathMatch?.[1]) {
    return normalizeClaimTokenInput(claimPathMatch[1])
  }

  if (s.includes('://') || s.startsWith('//')) {
    try {
      const url = new URL(s.startsWith('//') ? `https:${s}` : s)
      const fromQuery = url.searchParams.get('token')?.trim()
      if (fromQuery) return normalizeClaimTokenInput(fromQuery)
      const fromPath = url.pathname.match(/\/claim\/([^/?#]+)/i)?.[1]
      if (fromPath) return normalizeClaimTokenInput(fromPath)
    } catch {
      /* not a parseable URL */
    }
  }

  const qIdx = s.indexOf('?')
  if (qIdx >= 0) {
    try {
      const fromQuery = new URLSearchParams(s.slice(qIdx + 1)).get('token')?.trim()
      if (fromQuery) return normalizeClaimTokenInput(fromQuery)
    } catch {
      /* keep path segment before ? */
    }
    s = s.slice(0, qIdx).trim()
  }

  const hashIdx = s.indexOf('#')
  if (hashIdx >= 0) s = s.slice(0, hashIdx).trim()

  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(s)
      if (decoded === s) break
      s = decoded.trim()
    } catch {
      break
    }
  }

  return s.trim()
}

/** Prefer an explicit `?token=` query param, otherwise parse the dynamic route segment. */
export function parseClaimRouteToken(
  pathSegment: string,
  queryToken?: string | null
): string {
  const fromQuery = queryToken ? normalizeClaimTokenInput(queryToken) : ''
  if (fromQuery) return fromQuery
  return normalizeClaimTokenInput(pathSegment)
}

/** Build the path segment for a token (caller should encodeURIComponent when embedding in URLs). */
export function tokenClaimPath(token: string): string {
  const t = normalizeClaimTokenInput(token)
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
}

export type BeatcoinClaimErr = {
  ok: false
  error: string
}

export type BeatcoinClaimResponse = BeatcoinClaimOk | BeatcoinClaimErr

type BeatcoinClaimApiOk = {
  success: true
  points: number
}

type BeatcoinClaimApiErr = {
  error: string
}

type BeatcoinClaimApiPayload = BeatcoinClaimApiOk | BeatcoinClaimApiErr | BeatcoinClaimOk

/** Public lookup: resolve QR token → points + per-table claim status. */
export async function lookupBeatcoinToken(
  token: string,
  tableId?: string
): Promise<BeatcoinLookupResponse> {
  const params = new URLSearchParams({ token: normalizeClaimTokenInput(token) })
  if (tableId?.trim()) params.set('table_id', tableId.trim())
  const res = await fetch(`/api/beatcoins/lookup?${params}`)
  return (await res.json()) as BeatcoinLookupResponse
}

export type TokenRedemptionRecord = {
  table_id: string
  table_name: string
  redeemed_at: string
}

export type AdminTokenRecord = {
  id: string
  token: string
  mission_id: string
  points: number
  created_at: string
  mission_title: string
  redemption_count: number
  redemptions: TokenRedemptionRecord[]
}

const BEATCOIN_CLAIM_ERROR_MESSAGES: Record<string, string> = {
  already_claimed_by_table: 'Your table has already claimed this BeatCoin!',
  invalid_token: 'This BeatCoin link is not valid.',
  missions_disabled: 'Missions are currently disabled.',
  mission_not_found: 'This mission is no longer available.',
  invalid_mission: 'This mission is not a BeatCoin mission.',
  table_not_found: 'Table not found.',
  table_archived: 'This table is archived.',
  table_inactive: 'This table is inactive.',
  mission_not_assigned: 'This mission is not assigned to your table.',
}

/** Map claim_beatcoin RPC error codes to guest-facing copy. */
export function beatcoinClaimErrorMessage(code: string): string {
  const key = code.trim()
  return BEATCOIN_CLAIM_ERROR_MESSAGES[key] ?? key.replace(/_/g, ' ')
}

export function formatTokenRedemptionStatus(redemptionCount: number): string {
  if (redemptionCount <= 0) return 'Available'
  return redemptionCount === 1 ? '1 claim' : `${redemptionCount} claims`
}

export function formatRedeemedByNames(redemptions: TokenRedemptionRecord[]): string {
  if (redemptions.length === 0) return '—'
  return redemptions.map((r) => r.table_name).join(', ')
}

export function formatRedeemedAtSummary(redemptions: TokenRedemptionRecord[]): string {
  if (redemptions.length === 0) return '—'
  const latest = redemptions[0]?.redeemed_at
  if (!latest) return '—'
  if (redemptions.length === 1) return latest
  return `${latest} (+${redemptions.length - 1} more)`
}

/** Public claim: award BeatCoins to a table for a token (one redemption per table). */
export async function claimBeatcoinToken(
  token: string,
  tableId: string
): Promise<BeatcoinClaimResponse> {
  const res = await fetch('/api/beatcoins/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: normalizeClaimTokenInput(token),
      table_id: tableId.trim(),
    }),
  })

  let payload: BeatcoinClaimApiPayload
  try {
    payload = (await res.json()) as BeatcoinClaimApiPayload
  } catch {
    return { ok: false, error: `Request failed (${res.status})` }
  }

  if ('success' in payload && payload.success === true) {
    return { ok: true, points: payload.points }
  }

  if ('ok' in payload && payload.ok === true) return payload

  const error =
    ('error' in payload ? payload.error : undefined)?.trim() ||
    (res.ok ? 'claim_failed' : `Request failed (${res.status})`)

  return { ok: false, error }
}
