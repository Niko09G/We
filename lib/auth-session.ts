/** HMAC-signed admin session cookie (Edge + Node compatible via Web Crypto). */

export const ADMIN_AUTH_COOKIE_NAME = 'admin_authenticated'

const SESSION_PAYLOAD = 'authenticated'

async function importSessionKey(): Promise<CryptoKey | null> {
  const secret = process.env.ADMIN_PIN?.trim()
  if (!secret) return null
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function signatureToBase64Url(sig: ArrayBuffer): string {
  const bytes = new Uint8Array(sig)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function signatureFromBase64Url(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad =
    padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function createAdminSessionCookieValue(): Promise<string> {
  const key = await importSessionKey()
  if (!key) {
    throw new Error('ADMIN_PIN is not configured on the server.')
  }
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(SESSION_PAYLOAD)
  )
  return `${SESSION_PAYLOAD}.${signatureToBase64Url(sig)}`
}

export async function verifyAdminSessionCookieValue(
  value: string | undefined | null
): Promise<boolean> {
  if (!value) return false
  if (value === 'true') return true
  const dot = value.indexOf('.')
  if (dot < 0) return false
  const payload = value.slice(0, dot)
  const sigB64 = value.slice(dot + 1)
  if (payload !== SESSION_PAYLOAD || !sigB64) return false

  try {
    const key = await importSessionKey()
    if (!key) return false
    const sigBytes = signatureFromBase64Url(sigB64)
    return await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as BufferSource,
      new TextEncoder().encode(payload)
    )
  } catch {
    return false
  }
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }
}
