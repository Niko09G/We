'use client'

import { useMemo, useState } from 'react'
import {
  MISSION_CARD_BACKGROUNDS,
  missionGradientAt,
} from '@/lib/guest-missions-gradients'
import { missionTypeIcon } from '@/app/admin/missions/_components/mission-admin-shared'
import type { ValidationType } from '@/lib/admin-missions'
import { RewardAmount } from '@/components/reward/RewardAmount'

export type MissionPreviewInput = {
  title: string
  points: number
  validation_type: ValidationType
  card_theme_choice: number | 'auto'
  card_cover_image_url: string
  header_image_url: string
  /** Mission description / overlay body copy (admin preview). */
  description?: string
  /** Admin builder only: exact gradient for preview; publish still uses theme index in DB. */
  gradient_preview_override?: string | null
  /** Guest card primary CTA; blank → “Start mission”. */
  card_cta_label: string
  /** Guest card when complete; blank → “Completed”. */
  card_completed_label: string
  cardCompleted: boolean
  cardPending: boolean
}

const PREVIEW_TABS = [
  { id: 'card' as const, label: 'Card' },
  { id: 'overlay' as const, label: 'Overlay' },
  { id: 'done' as const, label: 'Completed' },
]

export function previewGradientForMissionForm(form: MissionPreviewInput): string {
  const override = form.gradient_preview_override?.trim()
  if (override) return override
  if (form.card_theme_choice !== 'auto') {
    return MISSION_CARD_BACKGROUNDS[form.card_theme_choice]!
  }
  return missionGradientAt([{ title: form.title.trim() || 'Mission' }], 0)
}

/** Side-by-side compact card + overlay previews for the Missions overlay builder (Step 2). */
export function MissionOverlaySplitPreviews({
  form,
  builderFlush,
}: {
  form: MissionPreviewInput
  /** Tall flush-bottom previews (no bottom radius) for the Step 2 builder column. */
  builderFlush?: boolean
}) {
  const surface = useMemo(() => previewGradientForMissionForm(form), [form])
  const title = form.title.trim() || 'Mission title'
  const pts = Math.max(0, Math.floor(form.points))
  const typeIcon = missionTypeIcon(form.validation_type)
  const ctaLabel = (form.card_cta_label ?? '').trim() || 'Start mission'
  const completedLabel = (form.card_completed_label ?? '').trim() || 'Completed'
  const cover =
    typeof form.card_cover_image_url === 'string' && form.card_cover_image_url.trim().length > 0
      ? form.card_cover_image_url.trim()
      : null
  const overlayImg =
    typeof form.header_image_url === 'string' && form.header_image_url.trim().length > 0
      ? form.header_image_url.trim()
      : null

  if (builderFlush) {
    return (
      <div className="flex min-h-0 w-full max-w-[760px] flex-1 flex-row gap-4 overflow-hidden px-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <p className="mb-2 shrink-0 text-center text-[11px] font-medium text-zinc-500">Card</p>
          <div className="flex min-h-0 flex-1 flex-col">
            <PreviewCard
              mode="card"
              compact
              builderFlush
              surface={surface}
              cover={cover}
              title={title}
              points={pts}
              typeIcon={typeIcon}
              beatcoin={form.validation_type === 'beatcoin'}
              pending={form.cardPending && !form.cardCompleted}
              completed={form.cardCompleted}
              ctaLabel={ctaLabel}
              completedLabel={completedLabel}
            />
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <p className="mb-2 shrink-0 text-center text-[11px] font-medium text-zinc-500">Overlay</p>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <PreviewCard
              mode="overlay"
              compact
              builderFlush
              surface={surface}
              title={title}
              overlayImg={overlayImg}
              overlayBodyText={(form.description ?? '').trim()}
              beatcoin={form.validation_type === 'beatcoin'}
              ctaLabel={ctaLabel}
              completedLabel={completedLabel}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-[760px] flex-row flex-wrap items-start justify-center gap-4">
      <div className="w-[min(100%,240px)] shrink-0">
        <p className="mb-2 text-center text-[11px] font-medium text-zinc-500">Card</p>
        <PreviewCard
          mode="card"
          compact
          surface={surface}
          cover={cover}
          title={title}
          points={pts}
          typeIcon={typeIcon}
          beatcoin={form.validation_type === 'beatcoin'}
          pending={form.cardPending && !form.cardCompleted}
          completed={form.cardCompleted}
          ctaLabel={ctaLabel}
          completedLabel={completedLabel}
        />
      </div>
      <div className="w-[min(100%,240px)] shrink-0">
        <p className="mb-2 text-center text-[11px] font-medium text-zinc-500">Overlay</p>
        <PreviewCard
          mode="overlay"
          compact
          surface={surface}
          title={title}
          overlayImg={overlayImg}
          overlayBodyText={(form.description ?? '').trim()}
          beatcoin={form.validation_type === 'beatcoin'}
          ctaLabel={ctaLabel}
          completedLabel={completedLabel}
        />
      </div>
    </div>
  )
}

export default function MissionLivePreview({ form }: { form: MissionPreviewInput }) {
  const [tab, setTab] = useState<(typeof PREVIEW_TABS)[number]['id']>('card')
  const surface = useMemo(() => previewGradientForMissionForm(form), [form])
  const title = form.title.trim() || 'Mission title'
  const pts = Math.max(0, Math.floor(form.points))
  const typeIcon = missionTypeIcon(form.validation_type)
  const ctaLabel = (form.card_cta_label ?? '').trim() || 'Start mission'
  const completedLabel = (form.card_completed_label ?? '').trim() || 'Completed'
  const cover =
    typeof form.card_cover_image_url === 'string' && form.card_cover_image_url.trim().length > 0
      ? form.card_cover_image_url.trim()
      : null
  const overlayImg =
    typeof form.header_image_url === 'string' && form.header_image_url.trim().length > 0
      ? form.header_image_url.trim()
      : null

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        Live preview
      </p>
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800/80 lg:hidden">
        {PREVIEW_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
              tab === t.id
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="hidden lg:block space-y-4">
        <PreviewCard
          mode="card"
          surface={surface}
          cover={cover}
          title={title}
          points={pts}
          typeIcon={typeIcon}
          beatcoin={form.validation_type === 'beatcoin'}
          pending={form.cardPending && !form.cardCompleted}
          completed={form.cardCompleted}
          ctaLabel={ctaLabel}
          completedLabel={completedLabel}
        />
        <PreviewCard
          mode="overlay"
          surface={surface}
          title={title}
          overlayImg={overlayImg}
          overlayBodyText={(form.description ?? '').trim()}
          beatcoin={form.validation_type === 'beatcoin'}
          ctaLabel={ctaLabel}
          completedLabel={completedLabel}
        />
        <PreviewCard
          mode="done"
          surface={surface}
          cover={cover}
          title={title}
          points={pts}
          typeIcon={typeIcon}
          beatcoin={form.validation_type === 'beatcoin'}
          pending={false}
          completed
          ctaLabel={ctaLabel}
          completedLabel={completedLabel}
        />
      </div>

      <div className="lg:hidden">
        {tab === 'card' ? (
          <PreviewCard
            mode="card"
            surface={surface}
            cover={cover}
            title={title}
            points={pts}
            typeIcon={typeIcon}
            beatcoin={form.validation_type === 'beatcoin'}
            pending={form.cardPending && !form.cardCompleted}
            completed={form.cardCompleted}
            ctaLabel={ctaLabel}
            completedLabel={completedLabel}
          />
        ) : tab === 'overlay' ? (
          <PreviewCard
            mode="overlay"
            surface={surface}
            title={title}
            overlayImg={overlayImg}
            overlayBodyText={(form.description ?? '').trim()}
            beatcoin={form.validation_type === 'beatcoin'}
            ctaLabel={ctaLabel}
            completedLabel={completedLabel}
          />
        ) : (
          <PreviewCard
            mode="done"
            surface={surface}
            cover={cover}
            title={title}
            points={pts}
            typeIcon={typeIcon}
            beatcoin={form.validation_type === 'beatcoin'}
            pending={false}
            completed
            ctaLabel={ctaLabel}
            completedLabel={completedLabel}
          />
        )}
      </div>
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function PreviewCard({
  mode,
  surface,
  cover,
  title,
  points,
  typeIcon,
  overlayImg,
  overlayBodyText,
  beatcoin,
  pending,
  completed,
  ctaLabel,
  completedLabel,
  compact = false,
  builderFlush = false,
}: {
  mode: 'card' | 'overlay' | 'done'
  surface: string
  cover?: string | null
  title: string
  points?: number
  typeIcon?: string
  overlayImg?: string | null
  /** Overlay description preview; empty shows a muted placeholder. */
  overlayBodyText?: string
  beatcoin?: boolean
  pending?: boolean
  completed?: boolean
  ctaLabel: string
  completedLabel: string
  compact?: boolean
  builderFlush?: boolean
}) {
  if (mode === 'overlay') {
    const bodyCopy = (overlayBodyText ?? '').trim()
    const shellRadius = builderFlush ? 'rounded-t-2xl rounded-b-none' : 'rounded-2xl'
    const innerRadius = builderFlush ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'
    const outerFlex = builderFlush ? 'flex min-h-0 flex-1 flex-col' : ''
    return (
      <div
        className={`overflow-hidden ${shellRadius} ring-1 ring-zinc-200/80 dark:ring-zinc-700 ${
          compact ? 'shadow-none' : 'shadow-lg'
        } ${outerFlex}`}
        style={{ background: surface }}
      >
        <div
          className={`mx-2 flex shrink-0 items-center justify-between ${
            compact ? 'mt-1.5 mb-0.5 px-1.5 py-1' : 'mt-2 mb-1 px-2 py-1.5'
          }`}
        >
          <span className={`truncate font-semibold text-white ${compact ? 'text-[10px]' : 'text-xs'}`}>{title}</span>
          {!compact ? (
            <span className="text-[10px] font-medium text-white/80">Preview</span>
          ) : null}
        </div>
        <div
          className={`mx-2 flex flex-col bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100 ${
            builderFlush ? 'mb-0 min-h-0 flex-1' : 'mb-2'
          } ${innerRadius} ${compact ? 'px-2.5 py-2.5' : 'px-4 py-4'}`}
        >
          <div className={`flex flex-col items-center ${builderFlush ? 'min-h-0 flex-1' : ''}`}>
            <div
              className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 ${
                compact ? 'h-12 w-12 text-lg' : 'h-16 w-16 text-xl'
              }`}
              style={
                overlayImg
                  ? {
                      backgroundImage: `url(${overlayImg})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
            >
              {!overlayImg ? <span aria-hidden>{beatcoin ? '🪙' : '📷'}</span> : null}
            </div>
            <p
              className={`mt-2 line-clamp-3 text-center text-zinc-500 ${compact ? 'text-[10px]' : 'text-xs'}`}
            >
              {bodyCopy ? (
                <span className="text-zinc-700">{bodyCopy}</span>
              ) : (
                <span className="text-zinc-400 italic">Guest content</span>
              )}
            </p>
            <div
              className={`w-full rounded-lg bg-zinc-100 py-1.5 text-center font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 ${
                builderFlush ? 'mt-auto' : ''
              } ${compact ? 'mt-2 text-[10px]' : 'mt-4 text-xs'}`}
            >
              Start mission
            </div>
          </div>
        </div>
      </div>
    )
  }

  const showCover = Boolean(cover)
  const doneState = mode === 'done' || completed

  const cardShellRadius = builderFlush ? 'rounded-t-2xl rounded-b-none' : 'rounded-2xl'
  const cardSizing = builderFlush
    ? 'min-h-0 flex-1 p-3 shadow-none'
    : compact
      ? 'h-[200px] p-3 shadow-none'
      : 'h-[220px] p-4 shadow-lg'

  return (
    <div
      className={`relative flex flex-col overflow-hidden ${cardShellRadius} text-left ring-1 ring-zinc-200/60 dark:ring-zinc-700 ${cardSizing}`}
      style={
        showCover
          ? undefined
          : {
              background: surface,
            }
      }
    >
      {showCover ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${cover})` }}
        />
      ) : null}
      <span
        className={`relative z-10 flex items-center justify-center rounded-full bg-white/90 leading-none text-zinc-800 ${
          compact ? 'h-7 w-7 text-sm' : 'h-9 w-9 text-base'
        }`}
        aria-hidden
      >
        {beatcoin ? '🪙' : typeIcon}
      </span>
      <h3
        className={`relative z-10 mt-2 pr-6 font-bold leading-snug text-white ${
          compact ? 'text-[11px]' : 'text-sm'
        }`}
      >
        {title}
      </h3>
      {typeof points === 'number' ? (
        <p
          className={`relative z-10 mt-1 font-semibold tabular-nums text-white/95 ${
            compact ? 'text-[10px]' : 'text-xs'
          }`}
        >
          <RewardAmount
            showPlus
            amount={points}
            iconSize={compact ? 12 : 16}
            displayVariant="onDark"
            className="text-white/95"
          />
        </p>
      ) : null}
      {pending && !doneState ? (
        <p className="relative z-10 mt-1.5 text-[10px] font-medium text-white/90">Pending review</p>
      ) : null}
      <div className="relative z-10 mt-auto w-full pt-2">
        {doneState ? (
          <span
            className={`flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-500 text-center font-semibold text-white ${
              compact ? 'px-2 py-1.5 text-[10px]' : 'px-3 py-2 text-xs shadow-sm'
            }`}
          >
            <CheckIcon className={`shrink-0 text-white ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
            {completedLabel}
          </span>
        ) : (
          <span
            className={`flex w-full items-center justify-center rounded-lg bg-white text-center font-semibold text-black ${
              compact ? 'px-2 py-1.5 text-[10px]' : 'px-3 py-2 text-xs'
            }`}
          >
            {ctaLabel}
          </span>
        )}
      </div>
    </div>
  )
}
