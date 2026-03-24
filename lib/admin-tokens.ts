/**
 * Client-safe helpers for token claim URLs (guest flow uses `/claim/[token]`).
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
