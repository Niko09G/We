'use client'

import { MISSIONS_HERO_BACKGROUND } from '@/lib/guest-missions-gradients'
import type { LobbyHeroSettings } from '@/lib/lobby-settings'
import { LobbyImageCarousel } from '@/components/guest/LobbyImageCarousel'

export type LobbyHeroProps = {
  loading: boolean
  hero: LobbyHeroSettings
  headerLogoUrl?: string | null
  heroBackgroundUrl?: string | null
  carouselImages?: string[]
  onFindSeat: () => void
}

/**
 * Full-viewport lobby hero — welcome copy and CTAs only (no points/rank HUD).
 */
export function LobbyHero({
  loading,
  hero,
  headerLogoUrl = null,
  heroBackgroundUrl = null,
  carouselImages = [],
  onFindSeat,
}: LobbyHeroProps) {
  const logo = headerLogoUrl?.trim()
  const background = heroBackgroundUrl?.trim()

  return (
    <section
      className={`relative z-0 box-border flex h-full min-h-0 w-full max-w-full min-w-0 flex-col justify-between pb-0 pt-[env(safe-area-inset-top,0px)] text-white ${
        background ? 'bg-cover bg-center bg-no-repeat' : ''
      }`}
      style={
        background
          ? { backgroundImage: `url(${background})` }
          : { background: MISSIONS_HERO_BACKGROUND }
      }
    >
      {logo ? (
        <header className="relative z-20 flex shrink-0 justify-center px-5 pt-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo}
            alt=""
            className="max-h-[80px] w-auto max-w-[250px] object-contain"
          />
        </header>
      ) : null}

      <div
        className={`relative z-10 flex min-h-0 w-full flex-1 flex-col px-5 ${
          logo ? '-mt-2 justify-start pt-8' : 'justify-start pt-10'
        }`}
      >
        <div className="relative mx-auto w-full max-w-sm pb-6 pt-2 text-center">
          {loading ? (
            <div className="space-y-5 animate-pulse">
              <div className="mx-auto h-8 w-48 rounded-2xl bg-white/20" />
              <div className="mx-auto h-4 w-full max-w-xs rounded-lg bg-white/15" />
              <div className="mx-auto h-4 w-56 rounded-lg bg-white/15" />
              <div className="mx-auto h-12 w-full max-w-xs rounded-[9999px] bg-white/20" />
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

              <p className="mx-auto mt-5 max-w-[22rem] whitespace-pre-line text-base font-medium leading-relaxed text-white/90 sm:text-lg">
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
              </div>
            </>
          )}
        </div>

        {!loading ? (
          <div className="mt-6">
            <LobbyImageCarousel images={carouselImages} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
