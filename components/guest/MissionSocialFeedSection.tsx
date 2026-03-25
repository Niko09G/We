'use client'

import { useCallback, useEffect, useState } from 'react'
import type { GuestMissionFeedItem } from '@/lib/guest-mission-feed'

/** Rail: fixed gap between cards; card width < viewport so the next item peeks. */
const CARD_GAP = 'gap-4'
/** ~76% viewport width, capped so tablets/desktop don’t grow overly wide. */
const CARD_WIDTH_CLASS = 'w-[min(76vw,18.5rem)] max-w-[18.5rem]'
/** One ratio for every tile (greeting + advice) — no tall “column” advice cells. */
const CARD_ASPECT = 'aspect-[4/5]'

function AdviceFeedCard({
  item,
  onOpen,
}: {
  item: Extract<GuestMissionFeedItem, { kind: 'advice' }>
  onOpen: () => void
}) {
  const excerpt =
    item.advice.length > 100 ? `${item.advice.slice(0, 97).trim()}…` : item.advice

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-zinc-900 text-left shadow-sm ring-1 ring-black/[0.06] transition active:scale-[0.98] motion-safe:hover:opacity-95"
    >
      <div
        className={`relative ${CARD_ASPECT} w-full min-h-0 overflow-hidden bg-gradient-to-b from-zinc-800 to-zinc-900`}
      >
        <div className="flex h-full flex-col justify-between p-3">
          <p className="line-clamp-6 text-left text-[11px] font-medium leading-snug tracking-tight text-white sm:text-xs">
            {excerpt}
          </p>
          <p className="truncate text-[9px] font-medium text-white/50">{item.tableName}</p>
        </div>
      </div>
    </button>
  )
}

function GreetingFeedCard({
  item,
  onOpen,
}: {
  item: Extract<GuestMissionFeedItem, { kind: 'greeting' }>
  onOpen: () => void
}) {
  const [mediaErr, setMediaErr] = useState(false)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full min-w-0 overflow-hidden rounded-2xl bg-zinc-900 text-left shadow-sm ring-1 ring-black/[0.06] transition active:scale-[0.98] motion-safe:hover:opacity-95"
    >
      <div className={`relative ${CARD_ASPECT} w-full overflow-hidden bg-zinc-300`}>
        {!mediaErr ? (
          item.mediaType === 'video' ? (
            <video
              src={item.mediaUrl}
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              onError={() => setMediaErr(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.mediaUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              onError={() => setMediaErr(true)}
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] text-zinc-500">
            Media
          </div>
        )}
      </div>
    </button>
  )
}

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
      <div
        className="pointer-events-auto flex w-full max-w-lg flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-100">
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
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 py-6 text-center">
              <p className="text-balance text-lg font-medium leading-snug text-zinc-900 sm:text-xl">
                “{item.advice}”
              </p>
              <p className="text-xs font-medium text-zinc-500">{item.tableName}</p>
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
            className="flex h-11 min-w-[3rem] items-center justify-center rounded-full border border-zinc-200/90 bg-white px-4 text-lg font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-40"
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
            className="flex h-11 min-w-[3rem] items-center justify-center rounded-full border border-zinc-200/90 bg-white px-4 text-lg font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-40"
            aria-label="Next"
          >
            ›
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mx-auto rounded-full border border-zinc-200 bg-white px-5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Close
        </button>
      </div>
    </div>
  )
}

export function MissionSocialFeedSection({
  items,
  loading = false,
}: {
  items: GuestMissionFeedItem[]
  loading?: boolean
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const openAt = useCallback((i: number) => {
    setLightboxIndex(i)
    setLightboxOpen(true)
  }, [])

  const skeletonCard = (
    <div
      className={`${CARD_WIDTH_CLASS} shrink-0 snap-start animate-pulse rounded-2xl bg-zinc-200/90 ${CARD_ASPECT}`}
      aria-hidden
    />
  )

  if (!loading && items.length === 0) return null

  return (
    <section
      className="w-full min-w-0"
      aria-label="Latest greetings and awful marriage advice"
    >
      <div className="mb-2 flex flex-col gap-0.5">
        <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">
          Latest greetings and awful marriage advice
        </h2>
        <p className="text-xs font-medium text-zinc-500">
          Swipe sideways — more cards peek from the right.
        </p>
      </div>

      <div
        className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2"
        aria-roledescription="carousel"
      >
        <div
          className="overflow-x-auto overscroll-x-contain pb-3 [scroll-padding-inline:1.25rem] [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        >
          <div className={`flex flex-row ${CARD_GAP} py-0.5 pl-5 pr-5`}>
            {loading ? (
              <>
                {skeletonCard}
                {skeletonCard}
                {skeletonCard}
              </>
            ) : (
              items.map((item, i) => (
                <div key={`${item.kind}-${item.id}`} className={`${CARD_WIDTH_CLASS} shrink-0 snap-start`}>
                  {item.kind === 'greeting' ? (
                    <GreetingFeedCard item={item} onOpen={() => openAt(i)} />
                  ) : (
                    <AdviceFeedCard item={item} onOpen={() => openAt(i)} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
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
