'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import type { GuestMissionFeedItem } from '@/lib/guest-mission-feed'

const TILE_GAP = 'gap-2'
const RAIL_GAP = 'gap-4'

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

type CellShape = 'square' | 'wide'

const PANEL_SHAPES: Record<PanelKind, readonly [CellShape, CellShape, CellShape]> = {
  A: ['square', 'square', 'wide'],
  B: ['wide', 'square', 'square'],
  C: ['wide', 'square', 'square'],
}

const ADVICE_FONT_STEPS = [
  { className: 'text-4xl', px: 36 },
  { className: 'text-3xl', px: 30 },
  { className: 'text-2xl', px: 24 },
  { className: 'text-xl', px: 20 },
  { className: 'text-lg', px: 18 },
  { className: 'text-base', px: 16 },
  { className: 'text-sm', px: 14 },
] as const

function buildEditorialSlots(items: GuestMissionFeedItem[]): FeedSlot[] {
  const greetings = items.filter(
    (i): i is Extract<GuestMissionFeedItem, { kind: 'greeting' }> => i.kind === 'greeting'
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
        slots.push({ key: `greeting-${item.id}-${slots.length}`, kind: 'greeting', item })
      }
    }
    if (ai < advice.length) {
      const item = advice[ai]!
      ai++
      slots.push({ key: `advice-${item.id}-${slots.length}`, kind: 'advice', item })
    } else if (gi >= greetings.length) {
      break
    }
  }

  while (ai < advice.length) {
    const item = advice[ai]!
    ai++
    slots.push({ key: `advice-tail-${item.id}-${slots.length}`, kind: 'advice', item })
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

function teamGradientFromColor(tableColor: string | null): string {
  const c = tableColor?.trim()
  if (c && /^#?[0-9a-fA-F]{3,6}$/.test(c)) {
    const hex = c.startsWith('#') ? c : `#${c}`
    return `linear-gradient(to bottom, ${hex}, color-mix(in srgb, ${hex} 68%, #000))`
  }
  return 'linear-gradient(to right, rgb(23, 163, 214), rgb(56, 105, 233), rgb(95, 50, 243))'
}

function adviceShapeForSlot(_shape: CellShape): CellShape {
  return 'wide'
}

function AdviceCardText({ text }: { text: string }) {
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
        className="font-semibold leading-snug tracking-tight text-white text-4xl"
        style={{ wordBreak: 'break-word' }}
      >
        {text}
      </p>
    </div>
  )
}

function AdviceTeamAvatar({
  avatarUrl,
  tableColor,
}: {
  avatarUrl: string | null
  tableColor: string | null
}) {
  const url = avatarUrl?.trim()
  const bg = tableColor?.trim() && /^#?[0-9a-fA-F]{3,6}$/.test(tableColor.trim())
    ? tableColor.trim().startsWith('#')
      ? tableColor.trim()
      : `#${tableColor.trim()}`
    : '#52525b'

  return (
    <span className="inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-white/40 bg-white/15">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="block h-full w-full" style={{ backgroundColor: bg }} aria-hidden />
      )}
    </span>
  )
}

function AdviceCard({
  item,
  onOpen,
  shape,
  avatarUrl,
}: {
  item: Extract<GuestMissionFeedItem, { kind: 'advice' }>
  onOpen: () => void
  shape: CellShape
  avatarUrl: string | null
}) {
  const effectiveShape = adviceShapeForSlot(shape)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl text-left ring-1 ring-white/15 transition active:scale-[0.98] motion-safe:hover:brightness-105"
      style={{ background: teamGradientFromColor(item.tableColor) }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-12 pt-3">
        <div
          className="pointer-events-none absolute left-3 top-1 z-0 select-none font-serif text-[52px] leading-none text-white/15"
          aria-hidden
        >
          &quot;
        </div>
        <AdviceCardText text={item.advice} />
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <AdviceTeamAvatar avatarUrl={avatarUrl} tableColor={item.tableColor} />
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
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative h-full min-h-0 w-full min-w-0 overflow-hidden rounded-2xl bg-zinc-900 text-left transition active:scale-[0.98] motion-safe:hover:opacity-95"
    >
      <div className="relative h-full w-full overflow-hidden bg-zinc-300">
        {item.mediaType === 'video' ? (
          <video
            src={item.mediaUrl}
            muted
            playsInline
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.mediaUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
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
  onOpen: (s: FeedSlot) => void,
  resolveAvatar: (tableId: string) => string | null
) {
  if (!cell) return <PlaceholderCell />
  if (cell.kind === 'advice') {
    const effectiveShape = adviceShapeForSlot(shape)
    return (
      <AdviceCard
        item={cell.item}
        shape={effectiveShape}
        avatarUrl={resolveAvatar(cell.item.tableId)}
        onOpen={() => onOpen(cell)}
      />
    )
  }
  return <GreetingCard item={cell.item} onOpen={() => onOpen(cell)} />
}

function PanelCollage({
  panel,
  onOpen,
  resolveAvatar,
}: {
  panel: PanelData
  onOpen: (s: FeedSlot) => void
  resolveAvatar: (tableId: string) => string | null
}) {
  const shapes = PANEL_SHAPES[panel.kind]
  const [a, b, c] = panel.cells
  const shell = `grid snap-start h-full min-h-0 shrink-0 ${TILE_GAP} w-[min(18.25rem,78vw)] grid-cols-2 grid-rows-2 [grid-template-rows:minmax(0,1fr)_minmax(0,1fr)]`

  const cell = (slot: FeedSlot | null, i: 0 | 1 | 2) =>
    renderCell(slot, shapes[i]!, onOpen, resolveAvatar)

  if (panel.kind === 'A') {
    return (
      <div className={shell}>
        <div className="min-h-0 min-w-0 [grid-column:1] [grid-row:1]">{cell(a, 0)}</div>
        <div className="min-h-0 min-w-0 [grid-column:2] [grid-row:1]">{cell(b, 1)}</div>
        <div className="col-span-2 row-start-2 min-h-0 min-w-0 [aspect-ratio:2/1]">
          {cell(c, 2)}
        </div>
      </div>
    )
  }

  return (
    <div className={shell}>
      <div className="col-span-2 row-start-1 min-h-0 min-w-0 [aspect-ratio:2/1]">{cell(a, 0)}</div>
      <div className="row-start-2 min-h-0 min-w-0 [grid-column:1] [grid-row:2]">{cell(b, 1)}</div>
      <div className="row-start-2 min-h-0 min-w-0 [grid-column:2] [grid-row:2]">{cell(c, 2)}</div>
    </div>
  )
}

export type LiveFeedGridProps = {
  items: GuestMissionFeedItem[]
  loading?: boolean
  tableAvatars?: Record<string, string>
  guestEmblems?: { team_emblem_by_table_id?: Record<string, string> }
  onOpenCell: (cell: FeedSlot) => void
  scrollerRef?: React.RefObject<HTMLDivElement | null>
}

export type LiveFeedSlot = FeedSlot

export function useLiveFeedPanels(items: GuestMissionFeedItem[]) {
  const slots = useMemo(() => buildEditorialSlots(items), [items])
  const padded = useMemo(() => padToPanels(slots), [slots])
  const panels = useMemo(() => splitIntoPanels(padded), [padded])
  return { slots, panels }
}

export function LiveFeedGrid({
  items,
  loading = false,
  tableAvatars = {},
  guestEmblems = {},
  onOpenCell,
  scrollerRef,
}: LiveFeedGridProps) {
  const { panels } = useLiveFeedPanels(items)

  const resolveAvatarForAdvice = (tableId: string) =>
    tableAvatars[tableId]?.trim() ||
    guestEmblems.team_emblem_by_table_id?.[tableId]?.trim() ||
    null

  return (
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
            <div
              className={`grid h-full min-h-0 w-[min(17.5rem,86vw)] shrink-0 grid-cols-2 grid-rows-2 ${TILE_GAP}`}
            >
              <div className="rounded-2xl bg-zinc-200/80" />
              <div className="rounded-2xl bg-zinc-200/80" />
              <div className="col-span-2 aspect-[2/1] rounded-2xl bg-zinc-200/80" />
            </div>
            <div
              className={`grid h-full min-h-0 w-[min(17.5rem,86vw)] shrink-0 grid-cols-2 grid-rows-2 ${TILE_GAP}`}
            >
              <div className="col-span-2 aspect-[2/1] rounded-2xl bg-zinc-200/80" />
              <div className="rounded-2xl bg-zinc-200/80" />
              <div className="rounded-2xl bg-zinc-200/80" />
            </div>
          </>
        ) : (
          panels.map((panel, i) => (
            <div key={`panel-${panel.kind}-${i}`} className="shrink-0" data-feed-panel={i}>
              <PanelCollage
                panel={panel}
                onOpen={onOpenCell}
                resolveAvatar={resolveAvatarForAdvice}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
