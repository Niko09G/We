'use client'

import { forwardRef, type MutableRefObject } from 'react'
import { motion } from 'framer-motion'

import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { rewardUnitCompactLabel } from '@/lib/reward-unit'
import type { DisplayTeamVisual } from '@/lib/display-team-visuals'
import type { LeaderboardEntry } from '@/lib/leaderboard'

function tableInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

function RankEmblem({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-sm font-black text-amber-950 shadow-[0_2px_8px_rgba(0,0,0,0.25)] ring-2 ring-white/50"
        aria-label="Rank 1"
      >
        1
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-400 text-sm font-black text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.2)] ring-2 ring-white/40"
        aria-label="Rank 2"
      >
        2
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-orange-600 text-sm font-black text-orange-950 shadow-[0_2px_8px_rgba(0,0,0,0.2)] ring-2 ring-white/35"
        aria-label="Rank 3"
      >
        3
      </span>
    )
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/25 text-sm font-bold text-white ring-2 ring-white/25"
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
  pointsDelta?: number
}

const TeamCard = forwardRef<HTMLDivElement, TeamCardProps>(function TeamCard(
  { entry, rank, visual, avatarUrl, pointsDelta },
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
      className="relative min-h-0 flex-1 overflow-hidden rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
      style={{ flex: '1 1 0' }}
    >
      <div className="absolute inset-0" style={{ background: gradient }} aria-hidden />
      <div className="relative flex h-full min-h-[88px] items-center gap-3 px-3 py-2.5">
        <RankEmblem rank={rank} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white drop-shadow-sm">{entry.tableName}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <RewardUnitIcon size={14} displayVariant="onDark" />
            <span className="text-lg font-bold tabular-nums text-white tracking-tight">
              {entry.totalPoints}
            </span>
            <span className="text-[10px] font-medium text-white/70">{unitLabel}</span>
            {pointsDelta != null && pointsDelta > 0 ? (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] font-bold tabular-nums text-amber-200"
              >
                +{pointsDelta}
              </motion.span>
            ) : null}
          </div>
        </div>
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/30 bg-white/10 shadow-md">
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroUrl} alt="" className="h-full w-full object-cover" />
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white/90">
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
  rowAnim: Record<string, { delta?: number }>
  isFullscreen: boolean
  onRequestFullscreen: () => void
  loading: boolean
  error: string | null
  teamCardRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
}) {
  const teamCount = entries.length

  return (
    <aside className="flex h-full min-h-0 w-[min(100%,300px)] shrink-0 flex-col gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-white">Leaderboard</h2>
        {!isFullscreen ? (
          <button
            type="button"
            onClick={onRequestFullscreen}
            className="rounded-lg bg-white/8 px-2 py-1 text-[10px] font-medium text-zinc-400 transition hover:bg-white/12 hover:text-zinc-200"
            aria-label="Enter fullscreen"
          >
            Fullscreen
          </button>
        ) : null}
      </div>

      {error && entries.length > 0 ? (
        <p className="text-[10px] text-amber-400/90" role="status">Live update paused</p>
      ) : null}

      <motion.div layout className="flex min-h-0 flex-1 flex-col gap-2">
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
              pointsDelta={anim?.delta}
            />
          )
        })}
      </motion.div>

      {teamCount > 0 ? (
        <p className="shrink-0 text-center text-[10px] text-zinc-600">
          {teamCount} team{teamCount === 1 ? '' : 's'}
        </p>
      ) : null}
    </aside>
  )
}
