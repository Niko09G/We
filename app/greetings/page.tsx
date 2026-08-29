'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GreetingLightbox } from '@/components/guest/GreetingLightbox'
import { TeamAvatar } from '@/components/guest/TeamAvatar'
import { greetingSenderLabel, previewMessage } from '@/lib/greeting-display'
import type { GreetingRow } from '@/lib/greetings-admin'
import {
  fetchGuestLiveFeedPage,
  LIVE_FEED_PAGE_SIZE,
  loadTableAvatarUrls,
  type GuestLiveFeedItem,
  type LiveFeedCursor,
} from '@/lib/guest-mission-feed'
import {
  fetchGuestEmblemsConfig,
  type GuestEmblemsSettingsValue,
} from '@/lib/guest-emblem-config'

const ADVICE_FONT_STEPS = [
  { className: 'text-4xl', px: 36 },
  { className: 'text-3xl', px: 30 },
  { className: 'text-2xl', px: 24 },
  { className: 'text-xl', px: 20 },
  { className: 'text-lg', px: 18 },
  { className: 'text-base', px: 16 },
] as const

function liveFeedItemToGreetingRow(item: GuestLiveFeedItem): GreetingRow {
  return {
    id: item.id,
    name: item.name,
    message: item.message,
    image_url: item.image_url ?? '',
    status: 'ready',
    created_at: item.created_at,
    source_type: item.source_type,
    table_id: item.table_id,
    table_name: item.table_name,
    table_color: item.table_color,
  }
}

function teamGradientFromColor(tableColor: string | null): string {
  const c = tableColor?.trim()
  if (c && /^#?[0-9a-fA-F]{3,6}$/.test(c)) {
    const hex = c.startsWith('#') ? c : `#${c}`
    return `linear-gradient(to bottom, ${hex}, color-mix(in srgb, ${hex} 68%, #000))`
  }
  return 'linear-gradient(to right, rgb(23, 163, 214), rgb(56, 105, 233), rgb(95, 50, 243))'
}

function FeedKindBadge({ kind }: { kind: GuestLiveFeedItem['feedKind'] }) {
  const isAdvice = kind === 'advice'
  return (
    <span
      className={`absolute right-3 top-3 z-20 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm ${
        isAdvice
          ? 'bg-violet-600/90 text-white'
          : 'bg-white/90 text-zinc-700 ring-1 ring-zinc-200/80'
      }`}
    >
      {isAdvice ? 'Advice' : 'Greeting'}
    </span>
  )
}

function DynamicAdviceText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const paragraph = textRef.current
    if (!container || !paragraph) return

    const fit = () => {
      const maxH = container.clientHeight
      const maxW = container.clientWidth
      if (maxH < 8 || maxW < 8) return

      const startIdx = text.length < 80 ? 0 : 1
      for (let i = startIdx; i < ADVICE_FONT_STEPS.length; i++) {
        const step = ADVICE_FONT_STEPS[i]!
        paragraph.className = `font-semibold leading-snug tracking-tight text-white ${step.className}`
        paragraph.style.fontSize = `${step.px}px`
        paragraph.style.lineHeight = '1.22'
        if (paragraph.scrollHeight <= maxH && paragraph.scrollWidth <= maxW) break
      }
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(container)
    return () => ro.disconnect()
  }, [text])

  return (
    <div ref={containerRef} className="relative z-10 flex min-h-0 flex-1 items-center overflow-hidden">
      <p
        ref={textRef}
        className="text-4xl font-semibold leading-snug tracking-tight text-white"
        style={{ wordBreak: 'break-word' }}
      >
        {text}
      </p>
    </div>
  )
}

function TextAdviceCard({
  item,
  onOpen,
}: {
  item: GuestLiveFeedItem
  onOpen: () => void
}) {
  const g = liveFeedItemToGreetingRow(item)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex aspect-[2/1] w-full flex-col overflow-hidden rounded-3xl text-left ring-1 ring-zinc-200/80 transition active:scale-[0.99] motion-safe:hover:brightness-105"
      style={{ background: teamGradientFromColor(item.table_color ?? null) }}
    >
      <FeedKindBadge kind={item.feedKind} />
      <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-14 pt-4">
        <div
          className="pointer-events-none absolute left-4 top-3 z-0 select-none font-serif text-[52px] leading-none text-white/15"
          aria-hidden
        >
          &quot;
        </div>
        <DynamicAdviceText text={item.message} />
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <TeamAvatar
          name={greetingSenderLabel(g)}
          avatarUrl={item.avatar_url}
          tableColor={item.table_color}
          size="md"
          className="h-9 w-9 border-2 border-white/40"
        />
      </div>
    </button>
  )
}

function ImageGreetingCard({
  item,
  onOpen,
}: {
  item: GuestLiveFeedItem
  onOpen: () => void
}) {
  const g = liveFeedItemToGreetingRow(item)
  const [imgErr, setImgErr] = useState(false)
  const gradientCss = teamGradientFromColor(item.table_color ?? null)

  if (imgErr || !item.image_url?.trim()) {
    return <TextAdviceCard item={item} onOpen={onOpen} />
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-zinc-200 text-left ring-1 ring-zinc-200 transition active:scale-[0.99] motion-safe:hover:opacity-95"
    >
      <FeedKindBadge kind={item.feedKind} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.image_url}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        onError={() => setImgErr(true)}
      />
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-4 pb-4 pt-16">
        <div className="flex items-end gap-2.5">
          <div
            className="shrink-0 rounded-full border-2 border-white/90 p-0.5 shadow-[0_3px_12px_rgba(0,0,0,0.32)]"
            style={{ background: gradientCss }}
            aria-hidden
          >
            <TeamAvatar
              name={greetingSenderLabel(g)}
              avatarUrl={item.avatar_url}
              tableColor={item.table_color}
              size="md"
              className="h-10 w-10 border-0"
            />
          </div>
          <div className="relative min-w-0 flex-1">
            <div
              className="absolute -left-1.5 bottom-5 h-2.5 w-2.5 rotate-45 bg-white shadow-sm"
              aria-hidden
            />
            <div className="origin-bottom-left rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-[0_6px_24px_rgba(0,0,0,0.22)]">
              <p className="truncate text-sm font-bold leading-tight text-zinc-900">
                {greetingSenderLabel(g)}
              </p>
              <p className="mt-1 line-clamp-4 text-sm font-medium leading-relaxed text-zinc-800">
                {previewMessage(item.message, 180)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function FeedCard({
  item,
  tableAvatars,
  guestEmblems,
  onOpen,
}: {
  item: GuestLiveFeedItem
  tableAvatars: Record<string, string>
  guestEmblems: GuestEmblemsSettingsValue
  onOpen: () => void
}) {
  const avatarUrl =
    item.avatar_url ||
    (item.table_id
      ? tableAvatars[item.table_id]?.trim() ||
        guestEmblems.team_emblem_by_table_id?.[item.table_id]?.trim() ||
        null
      : null)
  const enriched = avatarUrl ? { ...item, avatar_url: avatarUrl } : item

  if (!item.image_url?.trim()) {
    return <TextAdviceCard item={enriched} onOpen={onOpen} />
  }

  return <ImageGreetingCard item={enriched} onOpen={onOpen} />
}

export default function GreetingsGalleryPage() {
  const router = useRouter()
  const [items, setItems] = useState<GuestLiveFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<LiveFeedCursor | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [guestEmblems, setGuestEmblems] = useState<GuestEmblemsSettingsValue>({})
  const [tableAvatars, setTableAvatars] = useState<Record<string, string>>({})
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const feedOptsRef = useRef<{
    tableAvatars: Record<string, string>
    guestEmblems: GuestEmblemsSettingsValue
  }>({ tableAvatars: {}, guestEmblems: {} })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)

    void Promise.all([fetchGuestEmblemsConfig(), loadTableAvatarUrls()])
      .then(async ([cfg, avatars]) => {
        if (cancelled) return
        setGuestEmblems(cfg)
        setTableAvatars(avatars)
        feedOptsRef.current = { tableAvatars: avatars, guestEmblems: cfg }

        const { items: data, nextCursor: cursor } = await fetchGuestLiveFeedPage(
          null,
          LIVE_FEED_PAGE_SIZE,
          feedOptsRef.current
        )
        if (cancelled) return
        setItems(data)
        setNextCursor(cursor)
      })
      .catch((e) => {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'Failed to load live feed.')
        setItems([])
        setNextCursor(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !nextCursor) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const { items: data, nextCursor: cursor } = await fetchGuestLiveFeedPage(
        nextCursor,
        LIVE_FEED_PAGE_SIZE,
        feedOptsRef.current
      )
      if (data.length === 0) {
        setNextCursor(null)
        return
      }
      setItems((prev) => {
        const seen = new Set(prev.map((row) => row.id))
        const fresh = data.filter((row) => !seen.has(row.id))
        return [...prev, ...fresh]
      })
      setNextCursor(cursor)
    } catch {
      setNextCursor(null)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [nextCursor])

  useEffect(() => {
    feedOptsRef.current = { tableAvatars, guestEmblems }
  }, [tableAvatars, guestEmblems])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !nextCursor || loading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore()
        }
      },
      { rootMargin: '320px 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [nextCursor, loadMore, loading])

  const lightboxItems = items.map(liveFeedItemToGreetingRow)

  return (
    <main className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-5 py-4">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => {
              if (window.history.length > 1) router.back()
              else router.push('/')
            }}
            className="inline-flex shrink-0 rounded-full bg-black p-2 text-white transition hover:bg-zinc-800 active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
              />
            </svg>
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Live feed</h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg px-5 py-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`animate-pulse rounded-3xl bg-zinc-100 ${i % 3 === 0 ? 'sm:col-span-2 aspect-[2/1]' : 'aspect-[4/5]'}`}
              />
            ))}
          </div>
        ) : err ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {err}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm font-medium text-zinc-500">
            Nothing here yet. Share the first greeting or advice from the missions page.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((item, i) => {
                const textOnly = !item.image_url?.trim()
                return (
                  <div key={item.id} className={textOnly ? 'sm:col-span-2' : undefined}>
                    <FeedCard
                      item={item}
                      tableAvatars={tableAvatars}
                      guestEmblems={guestEmblems}
                      onOpen={() => {
                        setLightboxIndex(i)
                        setLightboxOpen(true)
                      }}
                    />
                  </div>
                )
              })}
            </div>
            <div ref={loadMoreRef} className="mt-6 flex min-h-8 items-center justify-center">
              {loadingMore ? (
                <span className="text-sm font-medium text-zinc-400">Loading more…</span>
              ) : null}
            </div>
          </>
        )}
      </div>

      <GreetingLightbox
        items={lightboxItems}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
      />
    </main>
  )
}
