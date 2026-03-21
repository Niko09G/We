'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { GreetingLightbox } from '@/components/guest/GreetingLightbox'
import { greetingSenderLabel, previewMessage } from '@/lib/greeting-display'
import type { GreetingRow } from '@/lib/greetings-admin'
import { listReadyGreetingsNewestFirst } from '@/lib/greetings-guest'

const PAGE_LIMIT = 120

function GridCard({
  g,
  onOpen,
}: {
  g: GreetingRow
  onOpen: () => void
}) {
  const accent = g.table_color?.trim()
  const isMission = g.source_type === 'mission'
  const [imgErr, setImgErr] = useState(false)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/70 text-left shadow-lg transition hover:border-white/20 hover:shadow-xl active:scale-[0.99]"
      style={{
        boxShadow:
          isMission && accent
            ? `0 12px 32px -8px rgba(0,0,0,0.55), inset 0 0 0 1px ${accent}40`
            : undefined,
      }}
    >
      <div
        className="relative aspect-[4/5] w-full bg-zinc-800"
        style={{
          borderBottom: isMission && accent ? `4px solid ${accent}` : undefined,
        }}
      >
        {!imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={g.image_url}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/40">
            Photo
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          {isMission && accent ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
          ) : null}
          <span className="font-semibold text-white">{greetingSenderLabel(g)}</span>
        </div>
        <p className="line-clamp-4 text-sm leading-relaxed text-white/70">
          {previewMessage(g.message, 220)}
        </p>
        <span className="text-xs text-violet-300/90">Tap to open →</span>
      </div>
    </button>
  )
}

export default function GreetingsGalleryPage() {
  const [items, setItems] = useState<GreetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await listReadyGreetingsNewestFirst(PAGE_LIMIT)
      setItems(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load greetings.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-8 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/play"
            className="text-xs font-medium text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
          >
            ← Lobby
          </Link>
          <Link
            href="/display"
            className="text-xs font-medium text-violet-300 underline-offset-2 hover:underline"
          >
            Live display
          </Link>
        </nav>

        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white">Greetings</h1>
          <p className="mt-2 text-sm text-white/65">
            Every message and photo shared for the couple — newest first.
          </p>
        </header>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-3xl bg-white/10"
              />
            ))}
          </div>
        ) : err ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {err}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-white/50">Nothing here yet. Share the first greeting from the upload page.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {items.map((g, i) => (
              <GridCard
                key={g.id}
                g={g}
                onOpen={() => {
                  setLightboxIndex(i)
                  setLightboxOpen(true)
                }}
              />
            ))}
          </div>
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
