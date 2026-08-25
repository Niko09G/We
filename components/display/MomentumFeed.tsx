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

function TeamChipAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const url = avatarUrl?.trim()
  if (!url) return null

  return (
    <span className="inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white/35 bg-white/15">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
    </span>
  )
}

function teamGradientCss(
  visual: DisplayTeamVisual | null,
  tableColor: string | null
): string {
  if (visual?.gradientCss) return visual.gradientCss
  const c = tableColor?.trim()
  if (c && /^#?[0-9a-fA-F]{3,6}$/.test(c)) {
    const hex = c.startsWith('#') ? c : `#${c}`
    return `linear-gradient(to bottom, ${hex}, color-mix(in srgb, ${hex} 70%, #000))`
  }
  return 'linear-gradient(to right, rgb(23, 163, 214), rgb(56, 105, 233), rgb(95, 50, 243))'
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
      className="pointer-events-none absolute right-6 top-6 z-20 flex w-[min(100%,520px)] flex-col items-end gap-3"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {visible.map((item) => {
          const visual = teamVisuals[item.tableId]
          const avatar = teamAvatars[item.tableId] ?? visual?.avatarUrl ?? null
          const gradient = teamGradientCss(visual ?? null, item.tableColor)
          return (
            <motion.div
              key={item.feedKey}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 56, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto w-full rounded-2xl px-4 py-3 shadow-xl"
              style={{ background: gradient }}
            >
              <div className="flex items-center gap-3">
                <TeamChipAvatar avatarUrl={avatar} />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium leading-snug text-white md:text-lg">
                    <span className="font-bold">{item.tableName}</span>
                    {' completed '}
                    <span>{item.missionTitle}</span>
                  </p>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-lg font-bold tabular-nums text-white"
                >
                  +{item.points}
                  <RewardUnitIcon size={18} displayVariant="onDark" />
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
