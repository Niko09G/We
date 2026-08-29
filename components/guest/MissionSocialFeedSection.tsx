'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FeedOverlayModal } from '@/components/FeedOverlayModal'
import { LiveFeedGrid, useLiveFeedPanels, type LiveFeedSlot } from '@/components/LiveFeedGrid'
import type { GuestMissionFeedItem } from '@/lib/guest-mission-feed'
import type { GuestEmblemsSettingsValue } from '@/lib/guest-emblem-config'

export function MissionSocialFeedSection({
  items,
  loading = false,
  sectionTitleColor,
  ctaColor,
  tableAvatars = {},
  guestEmblems = {},
}: {
  items: GuestMissionFeedItem[]
  loading?: boolean
  sectionTitleColor?: string
  ctaColor?: string
  tableAvatars?: Record<string, string>
  guestEmblems?: GuestEmblemsSettingsValue
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [feedDotIndex, setFeedDotIndex] = useState(0)

  const { panels } = useLiveFeedPanels(items)

  const slotToFeedIndex = useCallback(
    (cell: LiveFeedSlot) => {
      const kind = cell.kind
      const id = cell.item.id
      return Math.max(0, items.findIndex((f) => f.kind === kind && f.id === id))
    },
    [items]
  )

  const openCell = useCallback(
    (cell: LiveFeedSlot) => {
      setLightboxIndex(slotToFeedIndex(cell))
      setLightboxOpen(true)
    },
    [slotToFeedIndex]
  )

  useEffect(() => {
    const root = scrollerRef.current
    if (!root || loading || panels.length === 0) return

    const panelsEls = () =>
      [...root.querySelectorAll('[data-feed-panel]')] as HTMLElement[]

    const updateDot = () => {
      const kids = panelsEls()
      if (kids.length === 0) return
      const cx = root.scrollLeft + root.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      kids.forEach((el, i) => {
        const mid = el.offsetLeft + el.offsetWidth / 2
        const d = Math.abs(mid - cx)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      setFeedDotIndex(best)
    }

    updateDot()
    root.addEventListener('scroll', updateDot, { passive: true })
    return () => root.removeEventListener('scroll', updateDot)
  }, [loading, panels])

  if (!loading && items.length === 0) return null

  return (
    <section className="w-full min-w-0" aria-label="Live feed, and awful marriage advice">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2
          className="text-left text-2xl font-semibold leading-snug text-zinc-900"
          style={sectionTitleColor ? { color: sectionTitleColor } : undefined}
        >
          Live feed, and awful marriage advice
        </h2>
      </div>

      <LiveFeedGrid
        items={items}
        loading={loading}
        tableAvatars={tableAvatars}
        guestEmblems={guestEmblems}
        onOpenCell={openCell}
        scrollerRef={scrollerRef}
      />

      {!loading && panels.length > 0 ? (
        <div
          className="mt-3 flex justify-center gap-1.5"
          aria-label="Feed pages"
          role="tablist"
        >
          {panels.map((_, i) => (
            <span
              key={`feed-dot-${i}`}
              role="presentation"
              className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200 ${
                i === feedDotIndex ? 'bg-zinc-500' : 'bg-zinc-300/90'
              }`}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex w-full justify-center">
        <Link
          href="/greetings"
          className="inline-flex w-[min(300px,78vw)] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
          style={{ backgroundColor: ctaColor?.trim() || '#6335fb' }}
        >
          View all
        </Link>
      </div>

      <FeedOverlayModal
        items={items}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        tableAvatars={tableAvatars}
        guestEmblems={guestEmblems}
      />
    </section>
  )
}
