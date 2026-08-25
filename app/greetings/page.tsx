'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GreetingLightbox } from '@/components/guest/GreetingLightbox'
import { TeamAvatar } from '@/components/guest/TeamAvatar'
import { greetingSenderLabel, previewMessage } from '@/lib/greeting-display'
import {
  fetchGuestEmblemsConfig,
  type GuestEmblemsSettingsValue,
} from '@/lib/guest-emblem-config'
import type { GreetingRow } from '@/lib/greetings-admin'
import { listReadyGreetingsPage } from '@/lib/greetings-guest'

const PAGE_SIZE = 24

const ADVICE_FONT_STEPS = [
  { className: 'text-4xl', px: 36 },
  { className: 'text-3xl', px: 30 },
  { className: 'text-2xl', px: 24 },
  { className: 'text-xl', px: 20 },
  { className: 'text-lg', px: 18 },
  { className: 'text-base', px: 16 },
] as const

function teamGradientFromColor(tableColor: string | null): string {
  const c = tableColor?.trim()
  if (c && /^#?[0-9a-fA-F]{3,6}$/.test(c)) {
    const hex = c.startsWith('#') ? c : `#${c}`
    return `linear-gradient(to bottom, ${hex}, color-mix(in srgb, ${hex} 68%, #000))`
  }
  return 'linear-gradient(to right, rgb(23, 163, 214), rgb(56, 105, 233), rgb(95, 50, 243))'
}

function resolveTeamAvatar(
  g: GreetingRow,
  guestEmblems: GuestEmblemsSettingsValue
): string | null {
  const tableId = g.table_id?.trim()
  if (!tableId) return null
  return guestEmblems.team_emblem_by_table_id?.[tableId]?.trim() ?? null
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
  g,
  avatarUrl,
  onOpen,
}: {
  g: GreetingRow
  avatarUrl: string | null
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex aspect-[2/1] w-full flex-col overflow-hidden rounded-3xl text-left ring-1 ring-zinc-200/80 transition active:scale-[0.99] motion-safe:hover:brightness-105"
      style={{ background: teamGradientFromColor(g.table_color ?? null) }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-14 pt-4">
        <div
          className="pointer-events-none absolute left-4 top-3 z-0 select-none font-serif text-[52px] leading-none text-white/15"
          aria-hidden
        >
          &quot;
        </div>
        <DynamicAdviceText text={g.message} />
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <TeamAvatar
          name={greetingSenderLabel(g)}
          avatarUrl={avatarUrl}
          tableColor={g.table_color}
          size="md"
          className="h-9 w-9 border-2 border-white/40"
        />
      </div>
    </button>
  )
}

function ImageGreetingCard({
  g,
  avatarUrl,
  onOpen,
}: {
  g: GreetingRow
  avatarUrl: string | null
  onOpen: () => void
}) {
  const [imgErr, setImgErr] = useState(false)
  const gradientCss = teamGradientFromColor(g.table_color ?? null)

  if (imgErr || !g.image_url?.trim()) {
    return <TextAdviceCard g={g} avatarUrl={avatarUrl} onOpen={onOpen} />
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-zinc-200 text-left ring-1 ring-zinc-200 transition active:scale-[0.99] motion-safe:hover:opacity-95"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={g.image_url}
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
              avatarUrl={avatarUrl}
              tableColor={g.table_color}
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
                {previewMessage(g.message, 180)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function FeedCard({
  g,
  guestEmblems,
  onOpen,
}: {
  g: GreetingRow
  guestEmblems: GuestEmblemsSettingsValue
  onOpen: () => void
}) {
  const avatarUrl = resolveTeamAvatar(g, guestEmblems)

  if (!g.image_url?.trim()) {
    return <TextAdviceCard g={g} avatarUrl={avatarUrl} onOpen={onOpen} />
  }

  return <ImageGreetingCard g={g} avatarUrl={avatarUrl} onOpen={onOpen} />
}

export default function GreetingsGalleryPage() {
  const router = useRouter()
  const [items, setItems] = useState<GreetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [guestEmblems, setGuestEmblems] = useState<GuestEmblemsSettingsValue>({})
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void fetchGuestEmblemsConfig()
      .then((cfg) => {
        if (!cancelled) setGuestEmblems(cfg)
      })
      .catch(() => {
        if (!cancelled) setGuestEmblems({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await listReadyGreetingsPage(0, PAGE_SIZE)
      setItems(data)
      setHasMore(data.length >= PAGE_SIZE)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load greetings.')
      setItems([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const data = await listReadyGreetingsPage(items.length, PAGE_SIZE)
      if (data.length === 0) {
        setHasMore(false)
        return
      }
      setItems((prev) => {
        const seen = new Set(prev.map((row) => row.id))
        const fresh = data.filter((row) => !seen.has(row.id))
        return [...prev, ...fresh]
      })
      setHasMore(data.length >= PAGE_SIZE)
    } catch {
      setHasMore(false)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [hasMore, items.length])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasMore || loading) return

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
  }, [hasMore, loadMore, loading])

  return (
    <main className="min-h-screen bg-white px-5 py-6 pb-20">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => {
              if (window.history.length > 1) router.back()
              else router.push('/')
            }}
            className="inline-flex rounded-full bg-black p-2 text-white transition hover:bg-zinc-800 active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
              />
            </svg>
          </button>
        </div>

        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Greetings</h1>
          <p className="mt-2 text-base leading-relaxed text-zinc-500">
            Every message and photo shared for the couple — newest first.
          </p>
        </header>

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
            Nothing here yet. Share the first greeting from the upload page.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((g, i) => {
                const textOnly = !g.image_url?.trim()
                return (
                  <div key={g.id} className={textOnly ? 'sm:col-span-2' : undefined}>
                    <FeedCard
                      g={g}
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
        items={items}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
      />
    </main>
  )
}
