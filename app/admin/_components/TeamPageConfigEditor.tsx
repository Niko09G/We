'use client'

import { useRef, useState } from 'react'
import type { TeamPageAdminFormValues } from '@/lib/team-page-config'
import { compressImage, isAcceptedImageFile } from '@/lib/image-compress'
import {
  removeTeamHeroImageByPublicUrl,
  uploadTeamHeroImage,
} from '@/lib/team-hero-image-assets'

function colorForPicker(raw: string): string {
  const t = raw?.trim() ?? ''
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t
  if (/^#[0-9A-Fa-f]{3}$/i.test(t))
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`
  return '#94a3b8'
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const picker = colorForPicker(value)
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[140px] flex-1">
        <span className="mb-1 block text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={picker}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-zinc-200 dark:border-zinc-600 bg-transparent p-0"
            aria-label={label}
          />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            className="min-w-0 flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs font-mono"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Admin-only editor for `tables.page_config` (guest team page). Grouped: Hero, Theme, Typography.
 */
export function TeamPageConfigEditor({
  value,
  onChange,
  tableName,
}: {
  value: TeamPageAdminFormValues
  onChange: (next: TeamPageAdminFormValues) => void
  tableName: string
}) {
  const patch = (p: Partial<TeamPageAdminFormValues>) => onChange({ ...value, ...p })
  const [heroUploading, setHeroUploading] = useState(false)
  const [heroError, setHeroError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const heroBg =
    value.heroMiddle.trim().length > 0
      ? `linear-gradient(to bottom, ${value.heroTop}, ${value.heroMiddle}, ${value.heroBottom})`
      : `linear-gradient(to bottom, ${value.heroTop}, ${value.heroBottom})`

  return (
    <div className="mt-3 w-full basis-full border-t border-zinc-200 dark:border-zinc-700 pt-3">
      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
        Team page configuration
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        Saved to <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-0.5">page_config</code> on
        Save. Guests see this on the team missions URL.
      </p>

      <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Preview
        </p>
        <div
          className="mt-2 overflow-hidden rounded-md border border-white/20 px-3 py-2.5 text-left text-xs font-medium text-white shadow-sm"
          style={{ background: heroBg }}
        >
          <p className="line-clamp-3 whitespace-pre-line drop-shadow-sm">
            {value.teamText.trim() || 'Team text preview…'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
              style={{ backgroundColor: value.primaryColor || '#6335fb' }}
            >
              Primary CTA
            </span>
          </div>
        </div>
      </div>

      <fieldset className="mt-4 space-y-3">
        <legend className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Hero</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField label="Gradient top" value={value.heroTop} onChange={(heroTop) => patch({ heroTop })} />
          <ColorField
            label="Gradient middle (optional)"
            value={value.heroMiddle}
            onChange={(heroMiddle) => patch({ heroMiddle })}
          />
          <ColorField
            label="Gradient bottom"
            value={value.heroBottom}
            onChange={(heroBottom) => patch({ heroBottom })}
          />
        </div>
        <div>
          <span className="mb-1 block text-[10px] font-medium text-zinc-500">Hero image</span>
          <div className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2">
            {value.heroImageUrl.trim() ? (
              <div className="mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={value.heroImageUrl.trim()}
                  alt=""
                  className="h-24 w-full rounded object-cover"
                />
              </div>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0] ?? null
                e.currentTarget.value = ''
                if (!file) return
                setHeroError(null)
                if (!isAcceptedImageFile(file)) {
                  setHeroError('Use JPG, PNG, or WEBP.')
                  return
                }
                const previous = value.heroImageUrl.trim() || null
                setHeroUploading(true)
                try {
                  const { blob, contentType } = await compressImage(file)
                  const uploadFile = new File([blob], `hero.${contentType.split('/')[1] ?? 'jpg'}`, {
                    type: contentType,
                  })
                  const url = await uploadTeamHeroImage(uploadFile, tableName)
                  patch({ heroImageUrl: url })
                  await removeTeamHeroImageByPublicUrl(previous)
                } catch (err) {
                  setHeroError(err instanceof Error ? err.message : 'Hero image upload failed.')
                } finally {
                  setHeroUploading(false)
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={heroUploading}
                className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium disabled:opacity-50"
              >
                {heroUploading ? 'Uploading…' : value.heroImageUrl.trim() ? 'Replace image' : 'Upload image'}
              </button>
              {value.heroImageUrl.trim() ? (
                <button
                  type="button"
                  disabled={heroUploading}
                  onClick={async () => {
                    const previous = value.heroImageUrl.trim() || null
                    patch({ heroImageUrl: '' })
                    try {
                      await removeTeamHeroImageByPublicUrl(previous)
                    } catch {
                      // best effort cleanup
                    }
                  }}
                  className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium disabled:opacity-50"
                >
                  Remove image
                </button>
              ) : null}
            </div>
            {heroError ? (
              <p className="mt-2 text-xs font-medium text-rose-600">{heroError}</p>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500">
                Uploaded image URL is saved in <code>page_config.hero.heroImage.url</code>.
              </p>
            )}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-[10px] font-medium text-zinc-500">Team text</span>
          <textarea
            value={value.teamText}
            onChange={(e) => patch({ teamText: e.target.value })}
            rows={3}
            className="w-full resize-y rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </div>
      </fieldset>

      <fieldset className="mt-5 space-y-3">
        <legend className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Theme</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Primary color"
            value={value.primaryColor}
            onChange={(primaryColor) => patch({ primaryColor })}
          />
          <ColorField label="Icon color" value={value.iconColor} onChange={(iconColor) => patch({ iconColor })} />
        </div>
        <p className="text-[10px] font-medium text-zinc-500">Table gradient</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Table gradient top"
            value={value.tableGradTop}
            onChange={(tableGradTop) => patch({ tableGradTop })}
          />
          <ColorField
            label="Table gradient bottom"
            value={value.tableGradBottom}
            onChange={(tableGradBottom) => patch({ tableGradBottom })}
          />
        </div>
        <p className="text-[10px] font-medium text-zinc-500">Leaderboard gradient</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Leaderboard gradient top"
            value={value.lbGradTop}
            onChange={(lbGradTop) => patch({ lbGradTop })}
          />
          <ColorField
            label="Leaderboard gradient bottom"
            value={value.lbGradBottom}
            onChange={(lbGradBottom) => patch({ lbGradBottom })}
          />
        </div>
      </fieldset>

      <fieldset className="mt-5 space-y-3">
        <legend className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Typography</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Primary text color"
            value={value.textPrimary}
            onChange={(textPrimary) => patch({ textPrimary })}
          />
          <ColorField
            label="Secondary text color"
            value={value.textSecondary}
            onChange={(textSecondary) => patch({ textSecondary })}
          />
        </div>
      </fieldset>
    </div>
  )
}
