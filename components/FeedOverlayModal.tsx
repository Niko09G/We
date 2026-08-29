'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { TeamAvatar } from '@/components/guest/TeamAvatar'
import { previewMessage } from '@/lib/greeting-display'
import type { GuestMissionFeedItem } from '@/lib/guest-mission-feed'
import type { GuestEmblemsSettingsValue } from '@/lib/guest-emblem-config'

const ADVICE_FONT_STEPS = [
  { className: 'text-2xl', px: 24 },
  { className: 'text-xl', px: 20 },
  { className: 'text-lg', px: 18 },
  { className: 'text-base', px: 16 },
  { className: 'text-sm', px: 14 },
] as const

function teamGradientFromColor(tableColor: string | null): string {
  const c = tableColor?.trim()
  if (c && /^#?[0-9a-fA-F]{3,6}$/.test(c)) {
    const hex = c.startsWith('#') ? c : `#${c}`
    return `linear-gradient(to bottom right, ${hex}, color-mix(in srgb, ${hex} 68%, #000))`
  }
  return 'linear-gradient(to bottom right, rgb(23, 163, 214), rgb(56, 105, 233), rgb(95, 50, 243))'
}

function resolveAvatarUrl(
  tableId: string | null | undefined,
  tableAvatars: Record<string, string>,
  guestEmblems: GuestEmblemsSettingsValue
): string | null {
  const tid = tableId?.trim()
  if (!tid) return null
  return (
    tableAvatars[tid]?.trim() ||
    guestEmblems.team_emblem_by_table_id?.[tid]?.trim() ||
    null
  )
}

function OverlayAdviceText({ text }: { text: string }) {
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
        className="text-xl font-semibold leading-snug tracking-tight text-white"
        style={{ wordBreak: 'break-word' }}
      >
        {text}
      </p>
    </div>
  )
}

function OverlayAdviceCard({
  item,
  avatarUrl,
}: {
  item: Extract<GuestMissionFeedItem, { kind: 'advice' }>
  avatarUrl: string | null
}) {
  return (
    <div
      className="relative flex aspect-square w-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br ring-1 ring-white/15"
      style={{ background: teamGradientFromColor(item.tableColor) }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-14 pt-4">
        <div
          className="pointer-events-none absolute left-4 top-3 z-0 select-none font-serif text-[52px] leading-none text-white/15"
          aria-hidden
        >
          &quot;
        </div>
        <OverlayAdviceText text={item.advice} />
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <TeamAvatar
          name={item.tableName}
          avatarUrl={avatarUrl}
          tableColor={item.tableColor}
          size="md"
          className="h-9 w-9 border-2 border-white/40"
        />
      </div>
    </div>
  )
}

function OverlayGreetingCard({
  item,
  avatarUrl,
}: {
  item: Extract<GuestMissionFeedItem, { kind: 'greeting' }>
  avatarUrl: string | null
}) {
  const gradientCss = teamGradientFromColor(item.tableColor)

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-200">
      {item.mediaType === 'video' ? (
        <video
          src={item.mediaUrl}
          controls
          playsInline
          className="pointer-events-auto absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.mediaUrl}
          alt=""
          className="pointer-events-auto absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-4 pb-4 pt-16">
        <div className="flex items-center gap-2.5">
          <div
            className="shrink-0 rounded-full border-2 border-white/90 p-0.5 shadow-[0_3px_12px_rgba(0,0,0,0.32)]"
            style={{ background: gradientCss }}
            aria-hidden
          >
            <TeamAvatar
              name={item.senderLabel}
              avatarUrl={avatarUrl}
              tableColor={item.tableColor}
              size="md"
              className="h-10 w-10 border-0"
            />
          </div>
          <div className="relative min-w-0 flex-1">
            <div
              className="absolute -left-1.5 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 rotate-45 bg-white shadow-sm"
              aria-hidden
            />
            <div className="origin-center rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-[0_6px_24px_rgba(0,0,0,0.22)]">
              <p className="truncate text-sm font-bold leading-tight text-zinc-900">
                {item.senderLabel}
              </p>
              {item.caption ? (
                <p className="mt-1 line-clamp-4 text-sm font-medium leading-relaxed text-zinc-800">
                  {previewMessage(item.caption, 180)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FeedOverlayModal({
  items,
  index,
  open,
  onClose,
  tableAvatars = {},
  guestEmblems = {},
}: {
  items: GuestMissionFeedItem[]
  index: number
  open: boolean
  onClose: () => void
  tableAvatars?: Record<string, string>
  guestEmblems?: GuestEmblemsSettingsValue
}) {
  const safe = items.length ? Math.min(Math.max(0, index), items.length - 1) : 0
  const item = items[safe]

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !item) return null

  const tableId = item.kind === 'advice' ? item.tableId : item.tableId ?? null
  const avatarUrl = resolveAvatarUrl(tableId, tableAvatars, guestEmblems)

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-white/40 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Feed item"
      onClick={onClose}
    >
      <div
        className="pointer-events-auto flex w-full max-w-sm flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {item.kind === 'greeting' ? (
          <OverlayGreetingCard item={item} avatarUrl={avatarUrl} />
        ) : (
          <OverlayAdviceCard item={item} avatarUrl={avatarUrl} />
        )}

        <div className="flex w-full shrink-0 flex-col items-center gap-1.5 px-4 pb-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black text-2xl font-normal leading-none text-white transition hover:bg-zinc-800 active:scale-[0.98]"
            aria-label="Close"
          >
            <span aria-hidden className="translate-y-[1px] leading-none">
              ×
            </span>
          </button>
          <span className="text-sm font-medium text-black">Close</span>
        </div>
      </div>
    </div>
  )
}
