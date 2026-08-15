'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { rewardUnitCompactLabel } from '@/lib/reward-unit'
import type { DisplayTeamVisual } from '@/lib/display-team-visuals'
import type { RecentActivityItem } from '@/lib/leaderboard'

const FEED_TTL_MS = 15_000
const MAX_VISIBLE = 5

export type MomentumFeedItem = RecentActivityItem & {
  feedKey: string
  enteredAt: number
}

function tableInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

function TeamChipAvatar({
  name,
  avatarUrl,
  tableColor,
  visual,
}: {
  name: string
  avatarUrl: string | null
  tableColor: string | null
  visual: DisplayTeamVisual | null
}) {
  const url = avatarUrl?.trim()
  const bg =
    visual?.gradientCss ??
    (tableColor?.trim() && /^#?[0-9a-fA-F]{3,6}$/.test(tableColor.trim())
      ? tableColor.trim().startsWith('#')
        ? tableColor.trim()
        : `#${tableColor.trim()}`
      : '#52525b')

  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/25"
      style={{ background: bg }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white">
          {tableInitials(name)}
        </span>
      )}
    </span>
  )
}

export function MomentumFeed({
  items,
  teamVisuals,
  teamAvatars,
}: {
  items: MomentumFeedItem[]
  teamVisuals: Record<string, DisplayTeamVisual>
  teamAvatars: Record<string, string>
}) {
  const { config: rewardUnit } = useRewardUnit()
  const unitLabel = rewardUnitCompactLabel(rewardUnit)

  const visible = useMemo(() => {
    const now = Date.now()
    return items
      .filter((i) => now - i.enteredAt < FEED_TTL_MS)
      .slice(0, MAX_VISIBLE)
  }, [items])

  return (
    <div
      className="pointer-events-none absolute right-4 top-4 z-20 flex w-[min(100%,280px)] flex-col items-end gap-2"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {visible.map((item) => {
          const visual = teamVisuals[item.tableId]
          const avatar = teamAvatars[item.tableId] ?? visual?.avatarUrl ?? null
          return (
            <motion.div
              key={item.feedKey}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 56, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto w-full rounded-full border border-white/10 bg-black/30 px-2.5 py-2 shadow-lg backdrop-blur-md"
            >
              <div className="flex items-center gap-2">
                <TeamChipAvatar
                  name={item.tableName}
                  avatarUrl={avatar}
                  tableColor={item.tableColor}
                  visual={visual ?? null}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-white">
                    {item.tableName}
                  </p>
                  <p className="truncate text-[10px] text-white/75">{item.missionTitle}</p>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-amber-200"
                >
                  +{item.points}
                  <RewardUnitIcon size={10} displayVariant="onDark" />
                  <span className="sr-only">{unitLabel}</span>
                </span>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/** Merge incoming scoring events into a TTL-managed feed queue. */
export function useMomentumFeed(recentActivity: RecentActivityItem[]) {
  const [feedItems, setFeedItems] = useState<MomentumFeedItem[]>([])
  const seenRef = useRef<Set<string>>(new Set())
  const seededRef = useRef(false)

  useEffect(() => {
    if (!seededRef.current) {
      for (const r of recentActivity) seenRef.current.add(r.id)
      seededRef.current = true
      return
    }

    const fresh = recentActivity.filter((r) => !seenRef.current.has(r.id))
    if (fresh.length === 0) return

    const now = Date.now()
    for (const r of fresh) seenRef.current.add(r.id)

    const additions: MomentumFeedItem[] = fresh.map((r) => ({
      ...r,
      feedKey: `${r.id}:${now}`,
      enteredAt: now,
    }))

    setFeedItems((prev) => [...additions, ...prev].slice(0, 24))
  }, [recentActivity])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      setFeedItems((prev) => prev.filter((i) => now - i.enteredAt < FEED_TTL_MS))
    }
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return feedItems
}
