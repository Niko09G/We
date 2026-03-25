/**
 * Per-mission submission caps (per table). Rejected submissions do not count toward the cap.
 *
 * **Effective cap:** a positive integer limits pending+approved rows per table; **null means unlimited**
 * (admin “Max submissions” empty → `null` in DB, same as product unlimited).
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
  return null
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

export type GuestMissionRewardInput = MissionLimitFields & {
  points: number
  points_per_submission?: number | null
  approval_mode?: string | null
}

/**
 * Single reward value for guest cards, overlay, claim animation, and announcements.
 * Non-repeatable: `points` only. Repeatable auto (`isRepeatableAutoMission`): `points_per_submission ?? points`.
 */
export function guestMissionDisplayReward(m: GuestMissionRewardInput): number {
  const base = Math.max(0, Math.floor(Number(m.points) || 0))
  if (
    isRepeatableAutoMission({
      approval_mode: m.approval_mode,
      max_submissions_per_table: m.max_submissions_per_table,
      allow_multiple_submissions: m.allow_multiple_submissions,
    })
  ) {
    const pps = m.points_per_submission
    if (pps != null && pps !== undefined && Number.isFinite(Number(pps))) {
      return Math.max(0, Math.floor(Number(pps)))
    }
    return base
  }
  return base
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
