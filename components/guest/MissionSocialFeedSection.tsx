'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GuestMissionFeedItem } from '@/lib/guest-mission-feed'

// Internal spacing within a panel collage.
const TILE_GAP = 'gap-2'
// Spacing between panels in the horizontal rail.
const RAIL_GAP = 'gap-4'

/**
 * Repeating collage rhythm (horizontal scroll = panel after panel):
 * - Panel A: [square][square] / [—— wide ——]
 * - Panel B: [tall | medium] (tall spans both rows) + [square]
 * - Panel C: [—— wide ——] / [medium][square]
 *
 * Each panel is a 2-row collage with mixed shapes so the feed feels editorial.
 */
type FeedSlot =
  | {
      key: string
      kind: 'advice'
      item: Extract<GuestMissionFeedItem, { kind: 'advice' }>
    }
  | {
      key: string
      kind: 'greeting'
      item: Extract<GuestMissionFeedItem, { kind: 'greeting' }>
    }

type PanelKind = 'A' | 'B' | 'C'
const PANEL_CYCLE: PanelKind[] = ['A', 'B', 'C']
const CELLS_PER_PANEL = 3

type CellShape = 'square' | 'wide' | 'tall' | 'medium'

const PANEL_SHAPES: Record<
  PanelKind,
  readonly [CellShape, CellShape, CellShape]
> = {
  A: ['square', 'square', 'wide'],
  B: ['tall', 'medium', 'square'],
  C: ['wide', 'medium', 'square'],
}

function buildEditorialSlots(items: GuestMissionFeedItem[]): FeedSlot[] {
  const greetings = items.filter(
    (i): i is Extract<GuestMissionFeedItem, { kind: 'greeting' }> =>
      i.kind === 'greeting'
  )
  const advice = items.filter(
    (i): i is Extract<GuestMissionFeedItem, { kind: 'advice' }> => i.kind === 'advice'
  )

  const slots: FeedSlot[] = []
  let gi = 0
  let ai = 0

  while (gi < greetings.length || ai < advice.length) {
    if (gi < greetings.length) {
      for (let k = 0; k < 3 && gi < greetings.length; k++) {
        const item = greetings[gi]!
        gi++
        slots.push({
          key: `greeting-${item.id}-${slots.length}`,
          kind: 'greeting',
          item,
        })
      }
    }
    if (ai < advice.length) {
      const item = advice[ai]!
      ai++
      slots.push({
        key: `advice-${item.id}-${slots.length}`,
        kind: 'advice',
        item,
      })
    } else if (gi >= greetings.length) {
      break
    }
  }

  while (ai < advice.length) {
    const item = advice[ai]!
    ai++
    slots.push({
      key: `advice-tail-${item.id}-${slots.length}`,
      kind: 'advice',
      item,
    })
  }

  return slots
}

function padToPanels(slots: FeedSlot[]): (FeedSlot | null)[] {
  if (slots.length === 0) {
    return Array.from({ length: CELLS_PER_PANEL * 3 }, () => null)
  }
  const out: (FeedSlot | null)[] = [...slots]
  while (out.length % CELLS_PER_PANEL !== 0) out.push(null)
  return out
}

type PanelData = {
  kind: PanelKind
  cells: [FeedSlot | null, FeedSlot | null, FeedSlot | null]
}

function splitIntoPanels(cells: (FeedSlot | null)[]): PanelData[] {
  const panels: PanelData[] = []
  for (let i = 0; i < cells.length; i += CELLS_PER_PANEL) {
    const idx = (i / CELLS_PER_PANEL) % PANEL_CYCLE.length
    const kind = PANEL_CYCLE[idx]!
    panels.push({
      kind,
      cells: [cells[i] ?? null, cells[i + 1] ?? null, cells[i + 2] ?? null],
    })
  }
  return panels
}

function slotIndexInRealSlots(slots: FeedSlot[], cell: FeedSlot): number {
  return slots.findIndex((s) => s.key === cell.key)
}

function AdviceCard({
  item,
  onOpen,
  shape,
}: {
  item: Extract<GuestMissionFeedItem, { kind: 'advice' }>
  onOpen: () => void
  shape: CellShape
}) {
  const maxChars =
    shape === 'wide' ? 160 : shape === 'tall' ? 110 : shape === 'square' ? 125 : 115
  const excerpt =
    item.advice.length > maxChars
      ? `${item.advice.slice(0, Math.max(0, maxChars - 3)).trim()}…`
      : item.advice

  // Keep “tall” quote posts from feeling like an awkward text column.
  const lines =
    shape === 'tall'
      ? 'line-clamp-4'
      : shape === 'wide'
        ? 'line-clamp-4'
        : shape === 'square'
          ? 'line-clamp-3'
          : 'line-clamp-3'

  const textClass =
    shape === 'tall' || shape === 'wide'
      ? 'text-[11px] sm:text-[12px]'
      : 'text-[10.5px] sm:text-[11.5px]'

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-zinc-800/60 text-left ring-1 ring-white/10 transition active:scale-[0.98] motion-safe:hover:opacity-95"
    >
      <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-2 pt-3">
        <div
          className="pointer-events-none absolute left-3 top-2 z-0 select-none font-serif text-[64px] leading-none text-white/10"
          aria-hidden
        >
          &quot;
        </div>
        <p
          className={`relative z-10 ${lines} ${textClass} font-semibold leading-snug tracking-tight text-white/90`}
        >
          {excerpt}
        </p>
      </div>
      <div className="shrink-0 px-3 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-white/20"
            aria-hidden
          />
          <p className="truncate text-[9px] font-semibold text-white/55">
            {item.tableName}
          </p>
        </div>
      </div>
    </button>
  )
}

function GreetingCard({
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
      className="group relative h-full min-h-0 w-full min-w-0 overflow-hidden rounded-2xl bg-zinc-900 text-left transition active:scale-[0.98] motion-safe:hover:opacity-95"
    >
      <div className="relative h-full w-full overflow-hidden bg-zinc-300">
        {!mediaErr ? (
          item.mediaType === 'video' ? (
            <video
              src={item.mediaUrl}
              muted
              playsInline
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              onError={() => setMediaErr(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.mediaUrl}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
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

function PlaceholderCell() {
  return (
    <div
      className="h-full min-h-0 w-full min-w-0 rounded-2xl bg-zinc-200/75 ring-1 ring-inset ring-zinc-300/50"
      aria-hidden
    />
  )
}

function renderCell(
  cell: FeedSlot | null,
  shape: CellShape,
  onOpen: (s: FeedSlot) => void
) {
  if (!cell) return <PlaceholderCell />
  if (cell.kind === 'advice') {
    return <AdviceCard item={cell.item} shape={shape} onOpen={() => onOpen(cell)} />
  }
  return <GreetingCard item={cell.item} onOpen={() => onOpen(cell)} />
}

function PanelCollage({
  panel,
  onOpen,
}: {
  panel: PanelData
  onOpen: (s: FeedSlot) => void
}) {
  const shapes = PANEL_SHAPES[panel.kind]
  const [a, b, c] = panel.cells

  const cell = (slot: FeedSlot | null, i: 0 | 1 | 2) =>
    renderCell(slot, shapes[i]!, onOpen)

  // Panel width is intentionally < viewport so the next one peeks in.
  const shell = `grid snap-start h-full min-h-0 shrink-0 ${TILE_GAP} w-[min(18.25rem,78vw)]`

  if (panel.kind === 'A') {
    return (
      <div className={`${shell} grid-cols-2 grid-rows-2 [grid-template-rows:minmax(0,1fr)_minmax(0,1fr)]`}>
        <div className="min-h-0 min-w-0 [grid-column:1] [grid-row:1]">{cell(a, 0)}</div>
        <div className="min-h-0 min-w-0 [grid-column:2] [grid-row:1]">{cell(b, 1)}</div>
        <div className="min-h-0 min-w-0 col-span-2 [grid-column:1/3] [grid-row:2]">{cell(c, 2)}</div>
      </div>
    )
  }

  if (panel.kind === 'B') {
    return (
      <div className={`${shell} grid-cols-[minmax(0,0.4fr)_minmax(0,1fr)] grid-rows-2`}>
        <div className="min-h-0 min-w-0 row-span-2 [grid-column:1] [grid-row:1/3]">{cell(a, 0)}</div>
        <div className="min-h-0 min-w-0 [grid-column:2] [grid-row:1]">{cell(b, 1)}</div>
        <div className="min-h-0 min-w-0 [grid-column:2] [grid-row:2]">{cell(c, 2)}</div>
      </div>
    )
  }

  // Panel C
  return (
    <div className={`${shell} grid-cols-2 grid-rows-2`}>
      <div className="min-h-0 min-w-0 col-span-2 row-start-1 [grid-column:1/3]">{cell(a, 0)}</div>
      <div className="min-h-0 min-w-0 row-start-2 [grid-column:1] [grid-row:2]">{cell(b, 1)}</div>
      <div className="min-h-0 min-w-0 row-start-2 [grid-column:2] [grid-row:2]">{cell(c, 2)}</div>
    </div>
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
}: {
  items: GuestMissionFeedItem[]
  loading?: boolean
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const slots = useMemo(() => buildEditorialSlots(items), [items])
  const padded = useMemo(() => padToPanels(slots), [slots])
  const panels = useMemo(() => splitIntoPanels(padded), [padded])

  // Map selected panel-cell back to the original `items` index for lightbox next/prev.
  const slotToFeedIndex = useCallback(
    (cell: FeedSlot) => {
      const idx = slotIndexInRealSlots(slots, cell)
      if (idx < 0) return 0
      const kind = cell.kind
      const id = cell.item.id
      return Math.max(0, items.findIndex((f) => f.kind === kind && f.id === id))
    },
    [items, slots]
  )

  const openCell = useCallback(
    (cell: FeedSlot) => {
      setLightboxIndex(slotToFeedIndex(cell))
      setLightboxOpen(true)
    },
    [slotToFeedIndex]
  )

  if (!loading && items.length === 0) return null

  return (
    <section className="w-full min-w-0" aria-label="Latest greetings and awful marriage advice">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">
          Latest greetings and awful marriage advice
        </h2>
      </div>

      <div
        ref={scrollerRef}
        className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 overflow-x-auto overscroll-x-contain pb-3 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollPaddingLeft: '1.25rem',
          scrollPaddingRight: '1.25rem',
        }}
      >
        <div
          className={`flex h-[min(294px,43vh)] min-h-[min(294px,43vh)] max-h-[min(294px,43vh)] w-max flex-row items-stretch pl-5 pr-5 ${RAIL_GAP}`}
        >
          {loading ? (
            <>
              <div className={`grid h-full min-h-0 w-[min(17.5rem,86vw)] shrink-0 grid-cols-2 grid-rows-2 ${TILE_GAP}`}>
                <div className="rounded-2xl bg-zinc-200/80" />
                <div className="rounded-2xl bg-zinc-200/80" />
                <div className="col-span-2 rounded-2xl bg-zinc-200/80" />
              </div>
              <div className={`grid h-full min-h-0 w-[min(17.5rem,86vw)] shrink-0 grid-cols-2 grid-rows-2 ${TILE_GAP} [grid-template-columns:0.4fr_1fr]`}>
                <div className="row-span-2 rounded-2xl bg-zinc-200/80" />
                <div className="rounded-2xl bg-zinc-200/80" />
                <div className="rounded-2xl bg-zinc-200/80" />
              </div>
            </>
          ) : (
            panels.map((panel, i) => (
              <div key={`panel-${panel.kind}-${i}`} className="shrink-0">
                <PanelCollage panel={panel} onOpen={openCell} />
              </div>
            ))
          )}
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

