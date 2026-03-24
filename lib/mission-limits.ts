/**
 * Per-mission submission caps (per table). Rejected submissions do not count toward the cap.
 * Legacy: when max_submissions_per_table is null in DB but migration not applied,
 * use allow_multiple_submissions (false → 1, true → unlimited).
 */

export type MissionLimitFields = {
  max_submissions_per_table?: number | null
  allow_multiple_submissions?: boolean
}

/** null = unlimited; integer ≥ 1 = cap (pending + approved rows). */
export function effectiveMaxSubmissionsPerTable(m: MissionLimitFields): number | null {
  const raw = m.max_submissions_per_table
  if (raw !== null && raw !== undefined && Number.isFinite(Number(raw))) {
    const n = Math.floor(Number(raw))
    if (n >= 1) return n
  }
  if (m.allow_multiple_submissions === true) return null
  return 1
}

/** Auto + (unlimited OR multi-slot) → each insert can auto-approve (repeatable greeting flow). */
export function isRepeatableAutoMission(
  m: MissionLimitFields & { approval_mode?: string | null }
): boolean {
  const max = effectiveMaxSubmissionsPerTable(m)
  return (
    String(m.approval_mode ?? 'manual') === 'auto' && (max === null || max > 1)
  )
}

/** DB flag kept for backwards compatibility: true when more than one slot is allowed. */
export function allowMultipleSubmissionsFlag(m: MissionLimitFields): boolean {
  const max = effectiveMaxSubmissionsPerTable(m)
  return max === null || max > 1
}

export function isAtSubmissionLimit(
  m: MissionLimitFields | undefined,
  slotsUsedPendingOrApproved: number
): boolean {
  if (!m) return false
  const max = effectiveMaxSubmissionsPerTable(m)
  if (max === null) return false
  return slotsUsedPendingOrApproved >= max
}

/** Parse admin input: empty / whitespace → unlimited; otherwise positive integer. */
export function parseMaxSubmissionsInput(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Math.floor(Number(t))
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}
