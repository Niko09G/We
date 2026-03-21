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
