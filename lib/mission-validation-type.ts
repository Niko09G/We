/**
 * Mission validation types drive how guest submissions are labeled and reviewed.
 * All submissions stay `pending` until admin approves (no auto-approval yet).
 *
 * Future hooks:
 * - autoApprovalForType(type) → boolean
 * - signature: dedicated confirmation step before insert
 */

export const MISSION_VALIDATION_TYPES = ['signature', 'photo', 'manual'] as const
export type MissionValidationType = (typeof MISSION_VALIDATION_TYPES)[number]

export function normalizeMissionValidationType(
  raw: string | null | undefined
): MissionValidationType {
  const v = String(raw ?? 'manual').toLowerCase()
  if (v === 'signature' || v === 'photo' || v === 'manual') return v
  return 'manual'
}

/** Value stored in mission_submissions.submission_type (mirrors mission.validation_type). */
export function submissionTypeFromMissionValidation(
  raw: string | null | undefined
): MissionValidationType {
  return normalizeMissionValidationType(raw)
}

/** Short admin-facing copy: mission expects this kind of proof. */
export function missionValidationTypeLabel(type: MissionValidationType): string {
  switch (type) {
    case 'photo':
      return 'Photo proof'
    case 'signature':
      return 'Signature'
    default:
      return 'Manual'
  }
}

/** Explains why a pending row needs review (until auto-approval / signature flow exist). */
export function pendingReviewHintForMissionType(type: MissionValidationType): string {
  switch (type) {
    case 'photo':
      return 'Awaiting review: check photo proof, then approve or reject.'
    case 'signature':
      return 'Awaiting review: signature confirmation (manual review for now).'
    default:
      return 'Awaiting review: confirm this table completed the mission.'
  }
}
