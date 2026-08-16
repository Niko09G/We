'use client'

import { MISSIONS_HERO_BACKGROUND } from '@/lib/guest-missions-gradients'
import type { LobbyHeroSettings } from '@/lib/lobby-settings'

export type LobbyHeroProps = {
  loading: boolean
  hero: LobbyHeroSettings
  onFindSeat: () => void
  onSeeProgram: () => void
}

/**
 * Full-viewport lobby hero — welcome copy and CTAs only (no points/rank HUD).
 */
export function LobbyHero({ loading, hero, onFindSeat, onSeeProgram }: LobbyHeroProps) {
  return (
    <section
      className="relative isolate box-border flex h-full min-h-0 w-full max-w-full min-w-0 flex-col justify-between pb-10 pt-[env(safe-area-inset-top,0px)] text-white"
      style={{ background: MISSIONS_HERO_BACKGROUND }}
    >
      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col justify-center px-5 pt-2">
        <div className="relative mx-auto w-full max-w-sm text-center">
          {loading ? (
            <div className="space-y-5 animate-pulse">
              <div className="mx-auto h-8 w-48 rounded-2xl bg-white/20" />
              <div className="mx-auto h-4 w-full max-w-xs rounded-lg bg-white/15" />
              <div className="mx-auto h-4 w-56 rounded-lg bg-white/15" />
              <div className="mx-auto h-12 w-full max-w-xs rounded-[9999px] bg-white/20" />
              <div className="mx-auto h-12 w-full max-w-xs rounded-[9999px] bg-white/15" />
            </div>
          ) : (
            <>
              <h1 className="text-center text-3xl font-bold leading-tight text-white sm:text-4xl">
                {hero.title}
              </h1>

              <div
                className="mx-auto mt-5 h-px max-w-[14rem]"
                style={{
                  background:
                    'linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)',
                }}
                role="presentation"
              />

              <p className="mx-auto mt-5 max-w-[22rem] whitespace-pre-line text-sm font-medium leading-relaxed text-white/90 sm:text-base">
                {hero.description}
              </p>

              <div className="mt-6 flex w-full flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={onFindSeat}
                  className="inline-flex w-full max-w-xs items-center justify-center gap-1.5 rounded-[9999px] bg-white px-6 py-3 text-base font-medium text-black transition active:scale-[0.99] hover:bg-zinc-50"
                >
                  <span aria-hidden>🪑</span>
                  <span>{hero.cta_find_seat_label}</span>
                </button>
                <button
                  type="button"
                  onClick={onSeeProgram}
                  className="inline-flex w-full max-w-xs items-center justify-center gap-1.5 rounded-[9999px] border border-white/35 bg-white/15 px-6 py-3 text-base font-medium text-white backdrop-blur-sm transition active:scale-[0.99] hover:bg-white/25"
                >
                  <span aria-hidden>📅</span>
                  <span>{hero.cta_program_label}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
