'use client'

import { useMemo, useState } from 'react'
import {
  MISSION_CARD_BACKGROUNDS,
  missionGradientAt,
} from '@/lib/guest-missions-gradients'
import { missionTypeIcon } from '@/app/admin/missions/_components/mission-admin-shared'
import type { ValidationType } from '@/lib/admin-missions'

export type MissionPreviewInput = {
  title: string
  points: number
  validation_type: ValidationType
  card_theme_choice: number | 'auto'
  card_cover_image_url: string
  header_image_url: string
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

function previewGradient(form: MissionPreviewInput): string {
  if (form.card_theme_choice !== 'auto') {
    return MISSION_CARD_BACKGROUNDS[form.card_theme_choice]!
  }
  return missionGradientAt([{ title: form.title.trim() || 'Mission' }], 0)
}

export default function MissionLivePreview({ form }: { form: MissionPreviewInput }) {
  const [tab, setTab] = useState<(typeof PREVIEW_TABS)[number]['id']>('card')
  const surface = useMemo(() => previewGradient(form), [form])
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
  beatcoin,
  pending,
  completed,
  ctaLabel,
  completedLabel,
}: {
  mode: 'card' | 'overlay' | 'done'
  surface: string
  cover?: string | null
  title: string
  points?: number
  typeIcon?: string
  overlayImg?: string | null
  beatcoin?: boolean
  pending?: boolean
  completed?: boolean
  ctaLabel: string
  completedLabel: string
}) {
  if (mode === 'overlay') {
    return (
      <div
        className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-zinc-200/80 dark:ring-zinc-700"
        style={{ background: surface }}
      >
        <div className="mx-2 mt-2 mb-1 flex items-center justify-between px-2 py-1.5">
          <span className="truncate text-xs font-semibold text-white">{title}</span>
          <span className="text-[10px] font-medium text-white/80">Preview</span>
        </div>
        <div className="mx-2 mb-2 rounded-xl bg-white px-4 py-4 text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100">
          <div className="flex flex-col items-center">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 text-xl dark:border-zinc-700 dark:bg-zinc-900"
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
            <p className="mt-3 text-center text-xs text-zinc-500">Guest content area</p>
          </div>
          <div className="mt-4 rounded-lg bg-zinc-100 py-2 text-center text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Start mission
          </div>
        </div>
      </div>
    )
  }

  const showCover = Boolean(cover)
  const doneState = mode === 'done' || completed

  return (
    <div
      className="relative flex h-[220px] flex-col overflow-hidden rounded-2xl p-4 text-left shadow-lg ring-1 ring-zinc-200/60 dark:ring-zinc-700"
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
        className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-base leading-none text-zinc-800"
        aria-hidden
      >
        {beatcoin ? '🪙' : typeIcon}
      </span>
      <h3 className="relative z-10 mt-3 pr-10 text-sm font-bold leading-snug text-white">
        {title}
      </h3>
      {typeof points === 'number' ? (
        <p className="relative z-10 mt-1 text-xs font-semibold tabular-nums text-white/95">
          +{points} pts
        </p>
      ) : null}
      {pending && !doneState ? (
        <p className="relative z-10 mt-2 text-[11px] font-medium text-white/90">
          Pending review
        </p>
      ) : null}
      <div className="relative z-10 mt-3 w-full">
        {doneState ? (
          <span className="flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm">
            <CheckIcon className="h-3.5 w-3.5 shrink-0 text-white" />
            {completedLabel}
          </span>
        ) : (
          <span className="flex w-full items-center justify-center rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-black">
            {ctaLabel}
          </span>
        )}
      </div>
    </div>
  )
}
