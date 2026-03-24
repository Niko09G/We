/** Guest missions UI — vertical linear-gradients via inline `background` only. */

export const MISSIONS_HERO_BACKGROUND =
  'linear-gradient(to bottom, #7b3ff2 0%, #5a5ee6 40%, #4fa3c8 75%, #ffffff 100%)'

/** Six Canva-style card templates (cycle with `i % 6`) */
export const MISSION_CARD_BACKGROUNDS = [
  'linear-gradient(to bottom, #972cff, #5936f9, #b1eff9)',
  'linear-gradient(to bottom, #f75d05, #fdb386)',
  'linear-gradient(to bottom, #068636, #d0eea4)',
  'linear-gradient(to bottom, #ff3a4b, #ff5426, #ffdecd)',
  'linear-gradient(to bottom, #3628b8, #babcfd)',
  'linear-gradient(to bottom, #510f99, #9f37ff, #ecd5ff)',
] as const

export const MISSION_CARD_SKELETON_BACKGROUND =
  'linear-gradient(to bottom, #c4b5fd 0%, #ddd6fe 50%, #f0f4ff 100%)'

/** Default artwork when table greeting mission has no `header_image_url`. */
export const TABLE_GREETING_ARTWORK_PATH = '/hero/TableGreeting.png'

/** “Get Alex to explain the trumpet story” — carousel card background. */
export const TRUMPET_STORY_CARD_ARTWORK_PATH = '/missions/alex-trumpet-story-card.png'
/** Same mission — modal header / overlay artwork. */
export const TRUMPET_STORY_OVERLAY_ARTWORK_PATH = '/missions/alex-trumpet-story-overlay.png'
/** “Post a table greeting” — modal overlay artwork only. */
export const TABLE_GREETING_MODAL_OVERLAY_PATH = '/missions/photo-mission-thumb.png'

/** First hex color in a mission gradient string (for progress dots). */
export function firstStopColorFromMissionGradient(css: string): string {
  const m = css.match(/#([0-9a-fA-F]{3,8})\b/)
  return m?.[0] ?? '#6366f1'
}

/**
 * Swap gradient assignment between "Post a table greeting" and "Best group pose"
 * so they trade themes; all other missions keep index % 6.
 */
export function gradientIndexForMission(
  missions: { title: string }[],
  missionIndex: number
): number {
  const n = MISSION_CARD_BACKGROUNDS.length
  const base = missionIndex % n
  const gi = missions.findIndex((m) => /post a table greeting/i.test(m.title))
  const pi = missions.findIndex((m) => /best group pose/i.test(m.title))
  if (gi < 0 || pi < 0 || gi === pi) return base
  const gSlot = gi % n
  const pSlot = pi % n
  if (missionIndex === gi) return pSlot
  if (missionIndex === pi) return gSlot
  return base
}

export function missionGradientAt(missions: { title: string }[], missionIndex: number): string {
  return MISSION_CARD_BACKGROUNDS[gradientIndexForMission(missions, missionIndex)]!
}
