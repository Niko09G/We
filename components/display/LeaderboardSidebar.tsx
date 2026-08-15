'use client'

import { forwardRef, type MutableRefObject } from 'react'
import { motion } from 'framer-motion'

import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { resolveRankEmblemUrl, type GuestEmblemsSettingsValue } from '@/lib/guest-emblem-config'
import { rewardUnitCompactLabel } from '@/lib/reward-unit'
import type { DisplayTeamVisual } from '@/lib/display-team-visuals'
import type { LeaderboardEntry } from '@/lib/leaderboard'

function tableInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

function RankEmblem({
  rank,
  emblemUrl,
}: {
  rank: number
  emblemUrl: string | null
}) {
  if (emblemUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={emblemUrl}
        alt={`Rank ${rank}`}
        className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_3px_12px_rgba(0,0,0,0.3)]"
      />
    )
  }

  if (rank === 1) {
    return (
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-2xl font-black text-amber-950 shadow-[0_3px_12px_rgba(0,0,0,0.3)] ring-[3px] ring-white/50"
        aria-label="Rank 1"
      >
        1
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-400 text-2xl font-black text-zinc-800 shadow-[0_3px_12px_rgba(0,0,0,0.25)] ring-[3px] ring-white/40"
        aria-label="Rank 2"
      >
        2
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-orange-600 text-2xl font-black text-orange-950 shadow-[0_3px_12px_rgba(0,0,0,0.25)] ring-[3px] ring-white/35"
        aria-label="Rank 3"
      >
        3
      </span>
    )
  }
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-black/30 text-2xl font-bold text-white ring-[3px] ring-white/25"
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  )
}

type TeamCardProps = {
  entry: LeaderboardEntry
  rank: number
  visual: DisplayTeamVisual | null
  avatarUrl: string | null
  rankEmblemUrl: string | null
  pointsDelta?: number
}

const TeamCard = forwardRef<HTMLDivElement, TeamCardProps>(function TeamCard(
  { entry, rank, visual, avatarUrl, rankEmblemUrl, pointsDelta },
  ref
) {
  const { config: rewardUnit } = useRewardUnit()
  const unitLabel = rewardUnitCompactLabel(rewardUnit)
  const gradient =
    visual?.gradientCss ??
    (entry.tableColor?.trim() && /^#?[0-9a-fA-F]{3,6}$/.test(entry.tableColor.trim())
      ? `linear-gradient(145deg, ${entry.tableColor.trim().startsWith('#') ? entry.tableColor.trim() : `#${entry.tableColor.trim()}`}, color-mix(in srgb, ${entry.tableColor.trim().startsWith('#') ? entry.tableColor.trim() : `#${entry.tableColor.trim()}`} 55%, #000))`
      : 'linear-gradient(145deg, #3f3f46, #18181b)')

  const heroUrl = visual?.heroImageUrl ?? null

  return (
    <motion.div
      ref={ref}
      layout="position"
      layoutId={entry.tableId}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="relative min-h-0 flex-1 overflow-hidden"
      style={{ flex: '1 1 0' }}
    >
      <div className="absolute inset-0" style={{ background: gradient }} aria-hidden />

      <div className="relative flex h-full min-h-0 flex-col">
        <p className="relative z-10 shrink-0 truncate px-14 pt-3 text-center text-xl font-bold text-white drop-shadow-md md:text-2xl">
          {entry.tableName}
        </p>

        <div className="pointer-events-none absolute inset-y-0 left-4 z-10 flex items-center">
          <RankEmblem rank={rank} emblemUrl={rankEmblemUrl} />
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-4 z-10 flex items-center gap-2">
          <RewardUnitIcon size={28} displayVariant="onDark" />
          <span className="text-3xl font-bold tabular-nums tracking-tight text-white">
            {entry.totalPoints}
          </span>
          <span className="sr-only">{unitLabel}</span>
          {pointsDelta != null && pointsDelta > 0 ? (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm font-bold tabular-nums text-amber-200"
            >
              +{pointsDelta}
            </motion.span>
          ) : null}
        </div>

        <div className="relative mt-auto flex flex-1 items-end justify-center overflow-hidden px-2 pb-0 pt-2">
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroUrl}
              alt=""
              className="max-h-[85%] w-auto max-w-[90%] origin-bottom -mb-4 scale-[1.2] translate-y-2 object-contain object-bottom drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            />
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="max-h-[70%] w-auto max-w-[70%] origin-bottom -mb-4 scale-[1.2] translate-y-2 object-contain object-bottom drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            />
          ) : (
            <span className="mb-4 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/30 bg-white/10 text-2xl font-bold text-white/90 shadow-md">
              {tableInitials(entry.tableName)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
})

export function LeaderboardSidebar({
  entries,
  teamVisuals,
  teamAvatars,
  rankEmblems,
  rowAnim,
  isFullscreen,
  onRequestFullscreen,
  loading,
  error,
  teamCardRefs,
}: {
  entries: LeaderboardEntry[]
  teamVisuals: Record<string, DisplayTeamVisual>
  teamAvatars: Record<string, string>
  rankEmblems: GuestEmblemsSettingsValue
  rowAnim: Record<string, { delta?: number }>
  isFullscreen: boolean
  onRequestFullscreen: () => void
  loading: boolean
  error: string | null
  teamCardRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-zinc-950">
      <div className="relative flex shrink-0 items-center justify-center border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <h2 className="text-lg font-bold tracking-tight text-white">Leaderboard</h2>
        {!isFullscreen ? (
          <button
            type="button"
            onClick={onRequestFullscreen}
            className="absolute right-4 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/12 hover:text-zinc-200"
            aria-label="Enter fullscreen"
          >
            Fullscreen
          </button>
        ) : null}
      </div>

      {error && entries.length > 0 ? (
        <p className="shrink-0 bg-zinc-900 px-4 py-1 text-center text-xs text-amber-400/90" role="status">
          Live update paused
        </p>
      ) : null}

      <motion.div layout className="flex min-h-0 flex-1 flex-col">
        {loading && entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : null}
        {error && entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-red-400" role="alert">{error}</p>
        ) : null}
        {!loading && entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No teams yet</p>
        ) : null}

        {entries.map((entry, index) => {
          const rank = index + 1
          const anim = rowAnim[entry.tableId]
          return (
            <TeamCard
              key={entry.tableId}
              ref={(el) => {
                teamCardRefs.current[entry.tableId] = el
              }}
              entry={entry}
              rank={rank}
              visual={teamVisuals[entry.tableId] ?? null}
              avatarUrl={teamAvatars[entry.tableId] ?? null}
              rankEmblemUrl={resolveRankEmblemUrl(rankEmblems, rank)}
              pointsDelta={anim?.delta}
            />
          )
        })}
      </motion.div>
    </aside>
  )
}
