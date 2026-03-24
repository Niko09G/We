export const COIN_SIZE = 24

/** Announcement strips: strong readable text + very light matching tint (same model as emerald completed). */
export const MISSION_SIGNATURE_TEXT = '#6231fb'
export const MISSION_SIGNATURE_TINT_BG = 'rgba(98, 49, 251, 0.08)'
/** Orange “pending” theme — matches Tailwind orange-50 / orange-900 family softness. */
export const MISSION_PENDING_TEXT_CLASS = 'text-orange-950'
export const MISSION_PENDING_TINT_CLASS = 'bg-orange-50'
/** Completed reference (Tailwind emerald-50 + emerald-800). */
export const MISSION_COMPLETED_TEXT_CLASS = 'text-emerald-800'
export const MISSION_COMPLETED_TINT_CLASS = 'bg-emerald-50'

export const MISSION_PRIMARY_CTA_CLASS =
  'flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-black px-4 py-3.5 text-center text-[0.95rem] font-semibold text-white transition active:scale-[0.99] hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600'

export const MISSION_INPUT_CLASS =
  'w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-[0.9rem] font-normal leading-relaxed text-zinc-700 placeholder:text-zinc-500 outline-none focus:border-zinc-300'

/** Bottom CTA regions in overlay — match safe-area padding across flows. */
export const MISSION_OVERLAY_CTA_BAR_PAD =
  'px-3 pb-[max(1.1rem,calc(env(safe-area-inset-bottom)+0.55rem))] pt-3.5 sm:px-4'
