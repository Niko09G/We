'use client'

import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import type { GreetingRow } from '@/lib/greetings-admin'
import { greetingSenderLabel, previewMessage } from '@/lib/greeting-display'
import { GreetingLightbox } from '@/components/guest/GreetingLightbox'

const STRIP_VISIBLE = 12

type Props = {
  /** Newest-first list; only first `STRIP_VISIBLE` shown in strip; lightbox navigates full list. */
  items: GreetingRow[]
  loading?: boolean
  viewAllHref?: string
  /** e.g. "text-violet-300" for link styling on dark bg */
  linkClassName?: string
}

function Thumb({
  g,
  onClick,
}: {
  g: GreetingRow
  onClick: () => void
}) {
  const accent = g.table_color?.trim()
  const isMission = g.source_type === 'mission'
  const [imgErr, setImgErr] = useState(false)

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-[132px] shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900/80 text-left shadow-lg transition hover:border-white/25 hover:shadow-xl active:scale-[0.98] motion-safe:hover:-translate-y-0.5"
      style={{
        boxShadow:
          isMission && accent
            ? `0 8px 24px -4px rgba(0,0,0,0.5), inset 0 0 0 1px ${accent}33`
            : undefined,
      }}
    >
      <div
        className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-800"
        style={{
          borderBottom:
            isMission && accent ? `3px solid ${accent}` : '3px solid transparent',
        }}
      >
        {!imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={g.image_url}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
            Photo
          </div>
        )}
      </div>
      <div className="space-y-1 p-2.5">
        <div className="flex items-center gap-1.5 min-h-[1.25rem]">
          {isMission && accent ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
          ) : null}
          <span className="truncate text-[11px] font-semibold text-white/90">
            {greetingSenderLabel(g)}
          </span>
        </div>
        <p className="line-clamp-2 text-[10px] leading-snug text-white/55">
          {previewMessage(g.message, 64)}
        </p>
      </div>
    </button>
  )
}

export function GreetingsStripSection({
  items,
  loading = false,
  viewAllHref = '/greetings',
  linkClassName = 'text-[11px] font-semibold text-violet-300 underline-offset-2 hover:underline',
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const stripItems = items.slice(0, STRIP_VISIBLE)

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const delta = dir * Math.min(280, el.clientWidth * 0.85)
    el.scrollBy({ left: delta, behavior: 'smooth' })
  }, [])

  function openAt(globalIndex: number) {
    setLightboxIndex(globalIndex)
    setLightboxOpen(true)
  }

  return (
    <>
      <section className="rounded-3xl border border-white/10 bg-zinc-800/40 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">Latest greetings</h2>
          <div className="flex items-center gap-2">
            <Link href={viewAllHref} className={linkClassName}>
              View all
            </Link>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-white/55">
          Newest first — tap a card for the full message. Swipe left/right in the viewer on
          your phone.
        </p>

        {loading ? (
          <div className="mt-3 flex gap-2 overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[200px] w-[132px] shrink-0 animate-pulse rounded-2xl bg-white/10"
              />
            ))}
          </div>
        ) : stripItems.length === 0 ? (
          <p className="mt-3 text-xs text-white/45">
            No greetings on the wall yet. Be the first to post one!
          </p>
        ) : (
          <div className="relative mt-3">
            <button
              type="button"
              aria-label="Scroll greetings left"
              onClick={() => scrollByDir(-1)}
              className="absolute left-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-zinc-900/90 text-lg text-white shadow-md backdrop-blur-sm md:flex"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Scroll greetings right"
              onClick={() => scrollByDir(1)}
              className="absolute right-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-zinc-900/90 text-lg text-white shadow-md backdrop-blur-sm md:flex"
            >
              ›
            </button>

            <div
              ref={scrollerRef}
              className="-mx-1 flex gap-3 overflow-x-auto scroll-smooth px-1 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
            >
              {stripItems.map((g, i) => (
                <Thumb key={g.id} g={g} onClick={() => openAt(i)} />
              ))}
            </div>
          </div>
        )}
      </section>

      <GreetingLightbox
        items={items}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
      />
    </>
  )
}
