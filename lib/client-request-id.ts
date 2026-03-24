import { v4 as uuidv4 } from 'uuid'

/**
 * Safe client request ID generator for idempotent write calls.
 * Uses Web Crypto when available, falls back to uuid package.
 */
export function createClientRequestId(): string {
  try {
    if (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.crypto?.randomUUID === 'function'
    ) {
      return globalThis.crypto.randomUUID()
    }
  } catch {
    // Fall through to uuidv4 fallback.
  }
  return uuidv4()
}
