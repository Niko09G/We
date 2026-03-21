'use client'

import Link from 'next/link'
import { MISSIONS_HERO_BACKGROUND } from '@/lib/guest-missions-gradients'

export type MissionsTableHeroProps = {
  loading: boolean
  tableName: string
  tableColor: string | null
  tableRank: number | null
  totalTeams: number
  tablePoints: number
  missionsEnabled: boolean | null
  missionCount: number
  onStartMission: () => void
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
  missionsEnabled,
  missionCount,
  onStartMission,
}: MissionsTableHeroProps) {
  return (
    <section
      className="relative isolate h-[100dvh] min-h-[100dvh] max-h-[100dvh] overflow-hidden text-white"
      style={{ background: MISSIONS_HERO_BACKGROUND }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute left-[3%] top-[10%] h-14 w-14 rotate-[-11deg] rounded-2xl bg-white opacity-[0.12]" />
        <div className="absolute right-[4%] top-[14%] h-16 w-20 rotate-[9deg] rounded-2xl bg-white opacity-[0.1]" />
        <div className="absolute left-[2%] top-[48%] h-10 w-24 rotate-[-4deg] rounded-full bg-white opacity-[0.14]" />
        <div className="absolute right-[2%] top-[44%] h-12 w-12 rotate-[12deg] rounded-xl bg-white opacity-[0.11]" />
        <div className="absolute bottom-[12%] left-[5%] h-[4.5rem] w-16 rotate-[5deg] rounded-3xl bg-white opacity-[0.12]" />
        <div className="absolute bottom-[10%] right-[5%] h-11 w-[4rem] rotate-[-8deg] rounded-lg bg-white opacity-[0.1]" />
      </div>

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
              <p className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-950/80">
                <span
                  className="h-2 w-2 shrink-0 rounded-full ring-2 ring-violet-300/80"
                  style={{ backgroundColor: tableColor?.trim() || '#fef9c3' }}
                  aria-hidden
                />
                {tableName}
              </p>

              <div className="mt-5 flex flex-wrap items-baseline justify-center gap-0.5">
                <span className="text-[clamp(3rem,12vw,4.5rem)] font-black leading-none tracking-tight text-zinc-900">
                  {tableRank != null ? `#${tableRank}` : '#—'}
                </span>
                {totalTeams > 0 ? (
                  <span className="translate-y-1 text-xl font-medium text-zinc-600 sm:text-2xl">
                    /{totalTeams}
                  </span>
                ) : null}
              </div>

              <div
                className="mx-auto mt-6 h-px max-w-[14rem]"
                style={{
                  background:
                    'linear-gradient(to right, transparent, rgba(24,24,27,0.12), transparent)',
                }}
                role="presentation"
              />

              <p className="mt-6 text-base font-bold text-zinc-900 sm:text-lg">
                <span aria-hidden>✨ </span>
                {Number.isFinite(tablePoints) ? tablePoints : 0} points
              </p>

              <p className="mx-auto mt-4 max-w-[22rem] text-sm font-medium leading-relaxed text-zinc-800">
                Complete missions, and send greetings to the big screen to earn points and
                win!
              </p>

              <div className="mt-6 flex justify-center">
                {missionsEnabled === true && missionCount > 0 ? (
                  <button
                    type="button"
                    onClick={onStartMission}
                    className="rounded-[9999px] bg-white px-5 py-2 text-sm font-medium text-black transition active:scale-[0.99] hover:bg-zinc-50"
                  >
                    Start mission
                  </button>
                ) : missionsEnabled === true && !missionCount && !loading ? (
                  <p className="text-sm font-medium text-zinc-700">
                    Quests aren’t live yet — check back soon.
                  </p>
                ) : missionsEnabled === false ? (
                  <p className="text-sm font-medium text-zinc-700">
                    Quests open when your hosts unlock them.
                  </p>
                ) : null}
              </div>
            </>
          ) : !loading ? (
            <p className="text-sm font-medium text-zinc-800">
              Select a table from the list to get started.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
