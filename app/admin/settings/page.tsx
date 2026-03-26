'use client'

import { useCallback, useEffect, useState } from 'react'
import { RewardUnitIconFromConfig } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import {
  removeRewardUnitIconByPublicUrl,
  uploadRewardUnitIcon,
} from '@/lib/reward-unit-assets'
import {
  removeGuestEmblemByPublicUrl,
  uploadGuestEmblem,
} from '@/lib/guest-emblem-assets'
import {
  MAX_ICON_UPLOAD_BYTES,
  prettyMb,
} from '@/lib/upload-constraints'
import {
  DEFAULT_REWARD_UNIT,
  fetchRewardUnitConfig,
  setRewardUnitConfig,
  type RewardUnitConfig,
} from '@/lib/reward-unit'
import {
  fetchGuestEmblemsConfig,
  setGuestEmblemsConfig,
  type GuestEmblemsSettingsValue,
} from '@/lib/guest-emblem-config'

const RANK_SLOT_COUNT = 6 as const
const RANK_SLOT_INDICES = [0, 1, 2, 3, 4, 5] as const
type RankSlot = (typeof RANK_SLOT_INDICES)[number]

function rankSlotBounds(slot: RankSlot): { min_rank: number; max_rank: number } {
  const rank = slot + 1
  return { min_rank: rank, max_rank: rank }
}

export default function AdminSettingsPage() {
  const { reload: reloadRewardUnit } = useRewardUnit()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState<RewardUnitConfig>(DEFAULT_REWARD_UNIT)
  const [rankEmblems, setRankEmblems] = useState<GuestEmblemsSettingsValue['rank_emblems']>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, emblemCfg] = await Promise.all([
        fetchRewardUnitConfig(),
        fetchGuestEmblemsConfig(),
      ])
      setForm(c)
      setRankEmblems(emblemCfg.rank_emblems ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await Promise.all([
        setRewardUnitConfig(form),
        setGuestEmblemsConfig({
          rank_emblems: rankEmblems ?? [],
        }),
      ])
      setSuccess('Event currency saved.')
      await load()
      await reloadRewardUnit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadMainIcon(file: File) {
    if (file.type !== 'image/png' && file.type !== 'image/webp') {
      setError('Main icon must be PNG or WEBP.')
      return
    }
    if (file.size > MAX_ICON_UPLOAD_BYTES) {
      setError(`Main icon is too large. Max ${prettyMb(MAX_ICON_UPLOAD_BYTES)}.`)
      return
    }
    setUploadingSlot('main')
    setError(null)
    setSuccess(null)
    try {
      const previous = form.icon_main_url
      const publicUrl = await uploadRewardUnitIcon(file)
      await removeRewardUnitIconByPublicUrl(previous)
      setForm((s) => ({ ...s, icon_main_url: publicUrl }))
      setSuccess('Main icon uploaded. Click Save to publish.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploadingSlot(null)
    }
  }

  async function uploadAltIcon(index: 0 | 1 | 2, file: File) {
    if (file.type !== 'image/png' && file.type !== 'image/webp') {
      setError(`Support icon ${index + 1} must be PNG or WEBP.`)
      return
    }
    if (file.size > MAX_ICON_UPLOAD_BYTES) {
      setError(`Support icon ${index + 1} is too large. Max ${prettyMb(MAX_ICON_UPLOAD_BYTES)}.`)
      return
    }
    setUploadingSlot(`alt-${index + 1}`)
    setError(null)
    setSuccess(null)
    try {
      const previous = form.icon_alt_urls[index] ?? null
      const publicUrl = await uploadRewardUnitIcon(file)
      await removeRewardUnitIconByPublicUrl(previous)
      setForm((s) => {
        const next = [...s.icon_alt_urls]
        next[index] = publicUrl
        return { ...s, icon_alt_urls: next }
      })
      setSuccess(`Support icon ${index + 1} uploaded. Click Save to publish.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploadingSlot(null)
    }
  }

  async function removeMainIcon() {
    setError(null)
    setSuccess(null)
    const prev = form.icon_main_url
    setForm((s) => ({ ...s, icon_main_url: null }))
    await removeRewardUnitIconByPublicUrl(prev)
    setSuccess('Main icon removed. Click Save to publish.')
  }

  async function removeAltIcon(index: 0 | 1 | 2) {
    setError(null)
    setSuccess(null)
    const prev = form.icon_alt_urls[index] ?? null
    setForm((s) => {
      const next = [...s.icon_alt_urls]
      next[index] = ''
      return { ...s, icon_alt_urls: next }
    })
    await removeRewardUnitIconByPublicUrl(prev)
    setSuccess(`Support icon ${index + 1} removed. Click Save to publish.`)
  }

  async function uploadRankEmblem(slot: RankSlot, file: File) {
    if (file.type !== 'image/png' && file.type !== 'image/webp') {
      setError(`Rank emblem ${slot + 1} must be PNG or WEBP.`)
      return
    }
    if (file.size > MAX_ICON_UPLOAD_BYTES) {
      setError(`Rank emblem ${slot + 1} is too large. Max ${prettyMb(MAX_ICON_UPLOAD_BYTES)}.`)
      return
    }
    setUploadingSlot(`rank-${slot + 1}`)
    setError(null)
    setSuccess(null)
    try {
      const next = [...(rankEmblems ?? [])]
      const previous = next[slot]?.emblem_url ?? null
      const publicUrl = await uploadGuestEmblem(file)
      await removeGuestEmblemByPublicUrl(previous)
      next[slot] = {
        ...rankSlotBounds(slot),
        emblem_url: publicUrl,
      }
      setRankEmblems(next)
      setSuccess(`Rank emblem ${slot + 1} uploaded. Click Save to publish.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploadingSlot(null)
    }
  }

  async function removeRankEmblem(slot: RankSlot) {
    setError(null)
    setSuccess(null)
    const next = [...(rankEmblems ?? [])]
    const prev = next[slot]?.emblem_url ?? null
    next[slot] = { ...rankSlotBounds(slot), emblem_url: '' }
    setRankEmblems(next)
    await removeGuestEmblemByPublicUrl(prev)
    setSuccess(`Rank emblem ${slot + 1} removed. Click Save to publish.`)
  }

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <div>
        <h1 className="admin-page-title text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="admin-gap-page-title-intro admin-intro">
          Event-wide reward unit (currency) shown on guest missions, leaderboard, and displays.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {success}
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="admin-section-title text-zinc-900 dark:text-zinc-100">Event currency</h2>
        <p className="admin-meta-text">
          Static game UI uses the main icon. Support icons are reserved for reward animations.
          Upload PNG/WEBP files (same coin, different angles).
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block admin-field-label text-zinc-600 dark:text-zinc-400">
              Currency name
              <input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                className="mt-2 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                placeholder="e.g. BeatCoin"
              />
            </label>
            <label className="block admin-field-label text-zinc-600 dark:text-zinc-400">
              Short label (optional)
              <input
                value={form.short_label ?? ''}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    short_label: e.target.value.trim() || null,
                  }))
                }
                className="mt-2 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                placeholder="e.g. BC — for tight tables"
              />
            </label>
            <div className="space-y-3">
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <p className="admin-field-label text-zinc-700 dark:text-zinc-300">
                  Main icon (static UI)
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {form.icon_main_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded public asset preview
                    <img
                      src={form.icon_main_url}
                      alt=""
                      className="h-10 w-10 rounded border border-zinc-200 object-contain dark:border-zinc-700"
                    />
                  ) : (
                    <RewardUnitIconFromConfig config={form} size={30} />
                  )}
                  <label className="inline-flex cursor-pointer items-center rounded border border-zinc-300 px-3 py-1.5 admin-btn-text-small text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    {uploadingSlot === 'main' ? 'Uploading…' : 'Upload main icon'}
                    <input
                      type="file"
                      accept="image/png,image/webp"
                      className="sr-only"
                      disabled={uploadingSlot === 'main'}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.currentTarget.value = ''
                        if (!file) return
                        void uploadMainIcon(file)
                      }}
                    />
                  </label>
                  {form.icon_main_url ? (
                    <button
                      type="button"
                      className="text-xs text-zinc-500 underline hover:no-underline"
                      onClick={() => void removeMainIcon()}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              {[0, 1, 2].map((idx) => (
                <div key={idx} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Support icon {idx + 1} (animation)
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    {form.icon_alt_urls[idx] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded public asset preview
                      <img
                        src={form.icon_alt_urls[idx]}
                        alt=""
                        className="h-10 w-10 rounded border border-zinc-200 object-contain dark:border-zinc-700"
                      />
                    ) : (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700">
                        —
                      </span>
                    )}
                    <label className="inline-flex cursor-pointer items-center rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800">
                      {uploadingSlot === `alt-${idx + 1}` ? 'Uploading…' : 'Upload support icon'}
                      <input
                        type="file"
                        accept="image/png,image/webp"
                        className="sr-only"
                        disabled={uploadingSlot === `alt-${idx + 1}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.currentTarget.value = ''
                          if (!file) return
                          void uploadAltIcon(idx as 0 | 1 | 2, file)
                        }}
                      />
                    </label>
                    {form.icon_alt_urls[idx] ? (
                      <button
                        type="button"
                        className="text-xs text-zinc-500 underline hover:no-underline"
                        onClick={() => void removeAltIcon(idx as 0 | 1 | 2)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
              <span className="text-zinc-500">Preview:</span>
              <RewardUnitIconFromConfig config={form} size={22} />
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {form.short_label?.trim() || form.name}
              </span>
              <span className="tabular-nums text-zinc-600 dark:text-zinc-400">16</span>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Rank emblems</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Placement mapping used in mission HUD. Configure distinct emblems for ranks #1 through
          #{RANK_SLOT_COUNT}.
        </p>
        <div className="mt-4 space-y-3">
          {RANK_SLOT_INDICES.map((idx) => {
            const row = rankEmblems?.[idx]
            const url = row?.emblem_url?.trim() || ''
            const label = `#${idx + 1}`
            return (
              <div key={idx} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Rank emblem {label}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded public asset preview
                    <img
                      src={url}
                      alt=""
                      className="h-10 w-10 rounded border border-zinc-200 object-contain dark:border-zinc-700"
                    />
                  ) : (
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700">
                      —
                    </span>
                  )}
                  <label className="inline-flex cursor-pointer items-center rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    {uploadingSlot === `rank-${idx + 1}` ? 'Uploading…' : 'Upload emblem'}
                    <input
                      type="file"
                      accept="image/png,image/webp"
                      className="sr-only"
                      disabled={uploadingSlot === `rank-${idx + 1}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.currentTarget.value = ''
                        if (!file) return
                        void uploadRankEmblem(idx, file)
                      }}
                    />
                  </label>
                  {url ? (
                    <button
                      type="button"
                      className="text-xs text-zinc-500 underline hover:no-underline"
                      onClick={() => void removeRankEmblem(idx)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
