'use client'

import Link from 'next/link'
import { GUEST_EMBLEM_PLACEHOLDER_DATA_URL } from '@/lib/guest-emblem-config'
import { COIN_SIZE } from '@/lib/mission-ui'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { MISSIONS_HERO_BACKGROUND } from '@/lib/guest-missions-gradients'

export type MissionsTableHeroProps = {
  loading: boolean
  tableName: string
  tableColor: string | null
  tableRank: number | null
  totalTeams: number
  tablePoints: number
  heroTeamEmblemUrl?: string | null
  heroRankEmblemUrl?: string | null
  missionsEnabled: boolean | null
  missionCount: number
  onStartMission: () => void
  onSendGreeting: () => void
}

/**
 * Exactly 100vh hero, vertical gradient ending in white, content centered; nav overlaid at top.
 */
export function MissionsTableHero({
  loading,
  tableName,
  tableColor,
  tableRank,
  totalTeams,
  tablePoints,
  heroTeamEmblemUrl = null,
  heroRankEmblemUrl = null,
  missionsEnabled,
  missionCount,
  onStartMission,
  onSendGreeting,
}: MissionsTableHeroProps) {
  return (
    <section
      className="relative isolate h-[100dvh] min-h-[100dvh] max-h-[100dvh] w-full max-w-full min-w-0 overflow-x-hidden overflow-y-hidden text-white"
      style={{ background: MISSIONS_HERO_BACKGROUND }}
    >
      <nav className="absolute left-0 right-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <Link
          href="/play"
          className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-sm transition active:scale-[0.98] hover:bg-white/25"
        >
          ← Lobby
        </Link>
        <Link
          href="/missions"
          className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-sm transition active:scale-[0.98] hover:bg-white/25"
        >
          Switch table
        </Link>
      </nav>

      <div className="relative z-10 flex h-[100dvh] min-h-0 w-full items-center justify-center px-5 pb-6 pt-16">
        <div className="relative mx-auto w-full max-w-sm text-center">
          {loading && !tableName.trim() ? (
            <div className="space-y-5 animate-pulse">
              <div className="mx-auto h-3 w-36 rounded-full bg-white/25" />
              <div className="mx-auto h-16 w-44 rounded-2xl bg-white/20" />
              <div
                className="mx-auto h-px w-full max-w-xs"
                style={{
                  background:
                    'linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent)',
                }}
              />
              <div className="mx-auto h-5 w-32 rounded-full bg-white/25" />
              <div className="mx-auto h-4 w-full max-w-xs rounded-lg bg-white/15" />
              <div className="mx-auto h-8 w-32 rounded-[9999px] bg-white/20" />
            </div>
          ) : tableName.trim() ? (
            <>
              <div className="mx-auto mb-4 w-full max-w-xs">
                <img
                  src="/hero/hero-main.png"
                  alt=""
                  className="mx-auto w-[80%] max-w-[80%] object-contain"
                />
              </div>
              <p className="flex items-center justify-center text-center text-2xl font-semibold leading-snug text-white">
                {tableName}
              </p>

              <div className="mt-5 flex justify-center">
                <img
                  src={heroTeamEmblemUrl || heroRankEmblemUrl || GUEST_EMBLEM_PLACEHOLDER_DATA_URL}
                  alt=""
                  className="h-[84px] w-[84px] rounded-2xl object-contain"
                />
              </div>

              <div
                className="mx-auto mt-6 h-px max-w-[14rem]"
                style={{
                  background:
                    'linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)',
                }}
                role="presentation"
              />

              <div className="mt-5 flex items-center justify-center gap-5">
                <p className="inline-flex items-center gap-1 text-base font-semibold text-white sm:text-lg">
                  <img
                    src={heroRankEmblemUrl || heroTeamEmblemUrl || GUEST_EMBLEM_PLACEHOLDER_DATA_URL}
                    alt=""
                    className="h-6 w-6 rounded object-contain opacity-90"
                  />
                  <span className="tabular-nums">
                    {tableRank != null ? `#${tableRank}` : '#—'}
                  </span>
                  {totalTeams > 0 ? (
                    <span className="text-sm font-medium text-white/65">/{totalTeams}</span>
                  ) : null}
                </p>
                <p className="inline-flex items-center gap-1.5 text-base font-bold text-white sm:text-lg">
                  <RewardUnitIcon size={COIN_SIZE} />
                  <span className="tabular-nums">
                    {Number.isFinite(tablePoints) ? tablePoints : 0}
                  </span>
                </p>
              </div>

              <p className="mx-auto mt-4 max-w-[22rem] text-sm font-medium leading-relaxed text-white/90">
                We are Kaypoh Aunties! We see, we hear, we confirm win Bea &amp; Niko&apos;s wedding
                game.
                <br />
                Faster go play!
              </p>

              <div className="mt-6 flex w-full flex-col items-center gap-2.5">
                <button
                  type="button"
                  onClick={onStartMission}
                  className="inline-flex w-full max-w-xs items-center justify-center gap-1.5 rounded-[9999px] bg-white px-6 py-3 text-base font-medium text-black transition active:scale-[0.99] hover:bg-zinc-50"
                >
                  <span aria-hidden>🚀</span>
                  <span>Start mission</span>
                </button>
                <Link
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    onSendGreeting()
                  }}
                  className="inline-flex w-full max-w-xs items-center justify-center gap-1.5 rounded-[9999px] border border-white/35 bg-white/15 px-6 py-3 text-base font-medium text-white backdrop-blur-sm transition active:scale-[0.99] hover:bg-white/25"
                >
                  <span aria-hidden>📷</span>
                  <span>Send a greeting</span>
                </Link>
              </div>

              <div className="mt-3">
                {missionsEnabled === true && !missionCount && !loading ? (
                  <p className="text-sm font-medium text-white/85">
                    Quests aren’t live yet — check back soon.
                  </p>
                ) : missionsEnabled === false ? (
                  <p className="text-sm font-medium text-white/85">
                    Quests open when your hosts unlock them.
                  </p>
                ) : null}
              </div>
            </>
          ) : !loading ? (
            <p className="text-sm font-medium text-white/90">
              Select a table from the list to get started.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
