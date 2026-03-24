/**
 * Remembered team/table for guests without login (localStorage).
 * Used by Beatcoin claim flow to prefill team; always require explicit Claim tap.
 */

const STORAGE_KEY = 'wedding_guest_table_v1'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90 // 90 days

export type GuestTableContext = {
  tableId: string
  tableName: string
  savedAt: number
}

export function saveGuestTableContext(tableId: string, tableName: string): void {
  if (typeof window === 'undefined') return
  if (!tableId || !tableName.trim()) return
  try {
    const payload: GuestTableContext = {
      tableId: tableId.trim(),
      tableName: tableName.trim(),
      savedAt: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function readGuestTableContext(): GuestTableContext | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GuestTableContext>
    if (
      typeof parsed.tableId !== 'string' ||
      typeof parsed.tableName !== 'string' ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return {
      tableId: parsed.tableId,
      tableName: parsed.tableName,
      savedAt: parsed.savedAt,
    }
  } catch {
    return null
  }
}

export function clearGuestTableContext(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
