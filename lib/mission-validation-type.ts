/**
 * Mission validation types: content category for the mission (photo, video, signature).
 * approval_mode (auto/manual) is separate and controls whether admin must approve.
 */

export const MISSION_VALIDATION_TYPES = ['photo', 'video', 'signature', 'text', 'beatcoin'] as const
export type MissionValidationType = (typeof MISSION_VALIDATION_TYPES)[number]

/** Normalize DB value; legacy 'manual' is treated as 'photo'. */
export function normalizeMissionValidationType(
  raw: string | null | undefined
): MissionValidationType {
  const v = String(raw ?? 'photo').toLowerCase()
  if (v === 'signature' || v === 'photo' || v === 'video' || v === 'text' || v === 'beatcoin')
    return v
  if (v === 'manual') return 'photo'
  return 'photo'
}

/** Value stored in mission_submissions.submission_type (mirrors mission.validation_type). */
export function submissionTypeFromMissionValidation(
  raw: string | null | undefined
): MissionValidationType {
  return normalizeMissionValidationType(raw)
}

/** Short label for mission type (guest and admin). */
export function missionValidationTypeLabel(type: MissionValidationType): string {
  switch (type) {
    case 'photo':
      return 'Photo'
    case 'video':
      return 'Video'
    case 'signature':
      return 'Signature'
    case 'text':
      return 'Text'
    case 'beatcoin':
      return 'Beatcoin'
    default:
      return 'Photo'
  }
}

/** Explains why a pending row needs review. */
export function pendingReviewHintForMissionType(type: MissionValidationType): string {
  switch (type) {
    case 'photo':
      return 'Awaiting review: check photo proof, then approve or reject.'
    case 'video':
      return 'Awaiting review: check video, then approve or reject.'
    case 'signature':
      return 'Awaiting review: signature confirmation.'
    case 'text':
      return 'Awaiting review: read the text response, then approve or reject.'
    case 'beatcoin':
      return 'Beatcoin scan claim.'
    default:
      return 'Awaiting review.'
  }
}
