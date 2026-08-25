'use client'

import { TeamAvatar } from '@/components/guest/TeamAvatar'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import { leaderboardEntryIncludesTable } from '@/lib/table-teams'
import type { GuestEmblemsSettingsValue } from '@/lib/guest-emblem-config'
import { COIN_SIZE, safeRewardPoints } from '@/lib/mission-ui'

function resolveTeamAvatarUrl(
  tableId: string,
  tableAvatars: Record<string, string>,
  guestEmblems: GuestEmblemsSettingsValue
): string | null {
  return (
    tableAvatars[tableId]?.trim() ||
    guestEmblems.team_emblem_by_table_id?.[tableId]?.trim() ||
    null
  )
}

export type LeaderboardProps = {
  rows: LeaderboardEntry[]
  currentTableId: string
  tableAvatars: Record<string, string>
  guestEmblems: GuestEmblemsSettingsValue
  /** Gradient for non-highlighted rows. */
  sharedGradient: string
  /** Gradient stops for the viewer's team row. */
  youGradientTop: string
  youGradientBottom: string
  iconTintColor?: string
}

/** Full parent-team leaderboard with team avatar illustrations. */
export function Leaderboard({
  rows,
  currentTableId,
  tableAvatars,
  guestEmblems,
  sharedGradient,
  youGradientTop,
  youGradientBottom,
  iconTintColor,
}: LeaderboardProps) {
  if (rows.length === 0) return null

  return (
    <ul className="mt-3 flex w-full flex-col gap-3">
      {rows.map((row, i) => {
        const isYou = leaderboardEntryIncludesTable(row, currentTableId)
        const pointsShown = safeRewardPoints(row.totalPoints)
        return (
          <li
            key={row.teamId || row.tableId}
            className="flex items-center justify-between gap-3 rounded-md px-3 py-3 text-sm"
            style={{
              background: isYou
                ? `linear-gradient(to bottom, ${youGradientTop} 0%, ${youGradientBottom} 100%)`
                : sharedGradient,
              ...(isYou
                ? {
                    boxShadow:
                      '0 0 0 1px rgba(255,255,255,0.38), inset 0 0 0 1px rgba(255,255,255,0.22), 0 0 36px rgba(255,255,255,0.16)',
                  }
                : {}),
            }}
          >
            <span className="flex min-w-0 items-center gap-2.5 font-bold text-white">
              <span className="tabular-nums text-white">{i + 1}.</span>
              <TeamAvatar
                name={row.teamName || row.tableName}
                avatarUrl={resolveTeamAvatarUrl(row.tableId, tableAvatars, guestEmblems)}
                tableColor={row.teamColor ?? row.tableColor}
              />
              <span className="truncate">{row.teamName || row.tableName}</span>
              {isYou ? (
                <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-extrabold text-white">
                  You
                </span>
              ) : null}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-extrabold tabular-nums text-white">
              <RewardUnitIcon
                size={COIN_SIZE}
                displayVariant="onDark"
                tintColor={iconTintColor}
              />
              {pointsShown}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
