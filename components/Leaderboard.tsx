'use client'

import { useEffect, useMemo, useState } from 'react'
import { TeamAvatar } from '@/components/guest/TeamAvatar'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import { leaderboardEntryIncludesTable } from '@/lib/table-teams'
import type { GuestEmblemsSettingsValue } from '@/lib/guest-emblem-config'
import { COIN_SIZE, safeRewardPoints } from '@/lib/mission-ui'
import { supabase } from '@/lib/supabase/client'

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return null
}

function resolveTeamAvatarUrl(
  row: LeaderboardEntry,
  tableAvatars: Record<string, string>,
  guestEmblems: GuestEmblemsSettingsValue,
  guestAvatarsByTableId: Record<string, string>
): string | null {
  const teamKey = row.teamId || row.tableId
  const memberIds = row.memberTableIds ?? []

  const fromTeam = firstNonEmpty(row.avatar_url, row.logo_url, row.image)
  if (fromTeam) return fromTeam

  const fromTableAvatars = firstNonEmpty(
    tableAvatars[teamKey],
    ...memberIds.map((id) => tableAvatars[id])
  )
  if (fromTableAvatars) return fromTableAvatars

  const emblemMap = guestEmblems.team_emblem_by_table_id
  const fromEmblems = firstNonEmpty(
    emblemMap?.[teamKey],
    ...memberIds.map((id) => emblemMap?.[id])
  )
  if (fromEmblems) return fromEmblems

  return firstNonEmpty(...memberIds.map((id) => guestAvatarsByTableId[id]))
}

async function fetchGuestAvatarsByTableId(
  tableIds: string[]
): Promise<Record<string, string>> {
  if (tableIds.length === 0) return {}

  const { data, error } = await supabase
    .from('attendees')
    .select('table_id, seat_number, photo_url')
    .in('table_id', tableIds)
    .not('seat_number', 'is', null)
    .eq('is_archived', false)
    .order('seat_number', { ascending: true })

  if (error || !data) return {}

  const out: Record<string, string> = {}
  for (const row of data) {
    const tableId = row.table_id as string | null
    const photo = (row.photo_url as string | null)?.trim()
    if (!tableId || !photo || out[tableId]) continue
    out[tableId] = photo
  }
  return out
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
  const [guestAvatarsByTableId, setGuestAvatarsByTableId] = useState<
    Record<string, string>
  >({})

  const guestAvatarTableIdsKey = useMemo(() => {
    if (!rows.length) return ''
    const ids = new Set<string>()
    for (const row of rows) {
      for (const memberId of row.memberTableIds ?? []) {
        ids.add(memberId)
      }
    }
    return [...ids].sort().join(',')
  }, [rows])

  useEffect(() => {
    if (!guestAvatarTableIdsKey) {
      setGuestAvatarsByTableId({})
      return
    }
    let cancelled = false
    const tableIds = guestAvatarTableIdsKey.split(',')
    void fetchGuestAvatarsByTableId(tableIds).then((next) => {
      if (!cancelled) setGuestAvatarsByTableId(next)
    })
    return () => {
      cancelled = true
    }
  }, [guestAvatarTableIdsKey])

  if (rows.length === 0) return null

  return (
    <ul className="mt-3 flex w-full flex-col gap-2">
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
                avatarUrl={resolveTeamAvatarUrl(
                  row,
                  tableAvatars,
                  guestEmblems,
                  guestAvatarsByTableId
                )}
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
