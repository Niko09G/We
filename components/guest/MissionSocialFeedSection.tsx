'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LiveFeedGrid, useLiveFeedPanels, type LiveFeedSlot } from '@/components/LiveFeedGrid'
import type { GuestMissionFeedItem } from '@/lib/guest-mission-feed'
import type { GuestEmblemsSettingsValue } from '@/lib/guest-emblem-config'

function FeedLightbox({
  items,
  index,
  open,
  onClose,
  onIndexChange,
}: {
  items: GuestMissionFeedItem[]
  index: number
  open: boolean
  onClose: () => void
  onIndexChange: (i: number) => void
}) {
  const safe = items.length ? Math.min(Math.max(0, index), items.length - 1) : 0
  const item = items[safe]

  const goPrev = useCallback(() => {
    if (items.length < 2) return
    onIndexChange(safe <= 0 ? items.length - 1 : safe - 1)
  }, [items.length, onIndexChange, safe])

  const goNext = useCallback(() => {
    if (items.length < 2) return
    onIndexChange(safe >= items.length - 1 ? 0 : safe + 1)
  }, [items.length, onIndexChange, safe])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, goPrev, goNext])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !item) return null

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-white/40 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Feed item"
      onClick={onClose}
    >
      <div className="pointer-events-auto flex w-full max-w-lg flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-100 aspect-video">
          {item.kind === 'greeting' ? (
            item.mediaType === 'video' ? (
              <video
                src={item.mediaUrl}
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.mediaUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )
          ) : (
            <div className="absolute inset-0 px-7 py-7">
              <div
                className="pointer-events-none absolute left-5 top-4 z-0 select-none font-serif text-[92px] leading-none text-zinc-900/5"
                aria-hidden
              >
                &quot;
              </div>
              <div className="relative z-10 flex h-full flex-col justify-between">
                <p className="text-balance line-clamp-6 text-lg font-semibold leading-snug tracking-tight text-zinc-900 sm:text-xl">
                  “{item.advice}”
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-900/20" aria-hidden />
                  <p className="truncate text-xs font-semibold text-zinc-600">{item.tableName}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {item.kind === 'greeting' ? (
          <div className="flex flex-wrap items-center gap-2 px-0.5">
            {item.caption ? (
              <p className="max-w-full rounded-md bg-black px-2 py-1 text-[11px] font-medium text-white">
                {item.caption}
              </p>
            ) : null}
            <span
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-white"
              style={{ backgroundColor: '#4a53fa' }}
            >
              {item.senderLabel}
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={items.length < 2}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-lg font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-40 active:scale-[0.98]"
            aria-label="Previous"
          >
            ‹
          </button>
          <span className="min-w-[3.5rem] text-center text-xs font-medium text-zinc-600">
            {safe + 1} / {items.length}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={items.length < 2}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-lg font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-40 active:scale-[0.98]"
            aria-label="Next"
          >
            ›
          </button>
        </div>

        <div className="mt-2 flex w-full shrink-0 flex-col items-center gap-1.5 px-4 pb-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black text-2xl font-normal leading-none text-white transition hover:bg-zinc-800 active:scale-[0.98]"
            aria-label="Close"
          >
            <span aria-hidden className="leading-none translate-y-[1px]">
              ×
            </span>
          </button>
          <span className="text-sm font-medium text-black">Close</span>
        </div>
      </div>
    </div>
  )
}

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

      <FeedLightbox
        items={items}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
      />
    </section>
  )
}
