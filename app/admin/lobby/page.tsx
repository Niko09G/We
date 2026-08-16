'use client'

import { useCallback, useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  compressIconImage,
  compressPhotoImage,
  isAcceptedImageFile,
  webpUploadFile,
} from '@/lib/image-compress'
import {
  removeLobbyHeaderLogoByPublicUrl,
  removeLobbyHeroBackgroundByPublicUrl,
  uploadLobbyHeaderLogo,
  uploadLobbyHeroBackground,
} from '@/lib/lobby-assets'
import {
  removeLobbyMcPhotoByPublicUrl,
  uploadLobbyMcPhoto,
} from '@/lib/lobby-mc-assets'
import {
  DEFAULT_LOBBY_SETTINGS,
  fetchLobbySettings,
  lobbyModuleLabel,
  setLobbySettings,
  type LobbyMc,
  type LobbyModuleId,
  type LobbyProgramItem,
  type LobbySettings,
} from '@/lib/lobby-settings'
import { MAX_ICON_UPLOAD_BYTES, MAX_IMAGE_UPLOAD_BYTES, prettyMb } from '@/lib/upload-constraints'

const GRADIENT_BTN =
  'inline-flex h-[40px] cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]'

const INPUT_CLASS =
  'h-10 w-full rounded-xl border border-[#ebebeb] bg-white px-3 text-[14px] text-[#171717] outline-none transition-colors focus:border-zinc-400'

const TEXTAREA_CLASS =
  'w-full rounded-xl border border-[#ebebeb] bg-white px-3 py-2.5 text-[14px] text-[#171717] outline-none transition-colors focus:border-zinc-400'

function moveItem<T>(items: T[], index: number, direction: 'up' | 'down'): T[] {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const tmp = next[index]!
  next[index] = next[target]!
  next[target] = tmp
  return next
}

export default function AdminLobbyPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingMcId, setUploadingMcId] = useState<LobbyMc['id'] | null>(null)
  const [uploadingHeaderLogo, setUploadingHeaderLogo] = useState(false)
  const [uploadingHeroBackground, setUploadingHeroBackground] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState<LobbySettings>(DEFAULT_LOBBY_SETTINGS)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLobbySettings()
      setForm(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load lobby settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!success) return
    const t = window.setTimeout(() => setSuccess(null), 2400)
    return () => window.clearTimeout(t)
  }, [success])

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await setLobbySettings(form)
      setSuccess('Lobby settings saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save lobby settings.')
    } finally {
      setSaving(false)
    }
  }

  function updateModule(id: LobbyModuleId, patch: Partial<LobbySettings['modules'][LobbyModuleId]>) {
    setForm((prev) => ({
      ...prev,
      modules: {
        ...prev.modules,
        [id]: { ...prev.modules[id], ...patch },
      },
    }))
  }

  function moveModule(index: number, direction: 'up' | 'down') {
    setForm((prev) => ({
      ...prev,
      modules_order: moveItem(prev.modules_order, index, direction),
    }))
  }

  function updateProgramItem(id: string, patch: Partial<LobbyProgramItem>) {
    setForm((prev) => ({
      ...prev,
      event_program: prev.event_program.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }))
  }

  function addProgramItem() {
    setForm((prev) => ({
      ...prev,
      event_program: [
        ...prev.event_program,
        { id: uuidv4(), time: '6:00 PM', title: 'New activity', description: null },
      ],
    }))
  }

  function removeProgramItem(id: string) {
    setForm((prev) => ({
      ...prev,
      event_program: prev.event_program.filter((item) => item.id !== id),
    }))
  }

  function moveProgramItem(index: number, direction: 'up' | 'down') {
    setForm((prev) => ({
      ...prev,
      event_program: moveItem(prev.event_program, index, direction),
    }))
  }

  function updateMc(index: 0 | 1, patch: Partial<LobbyMc>) {
    setForm((prev) => {
      const mcs = [...prev.mcs] as [LobbyMc, LobbyMc]
      mcs[index] = { ...mcs[index], ...patch }
      return { ...prev, mcs }
    })
  }

  async function handleMcPhotoUpload(index: 0 | 1, file: File) {
    if (!isAcceptedImageFile(file)) {
      setError('Please choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_ICON_UPLOAD_BYTES) {
      setError(`Image must be under ${prettyMb(MAX_ICON_UPLOAD_BYTES)}.`)
      return
    }

    const mc = form.mcs[index]
    setUploadingMcId(mc.id)
    setError(null)
    try {
      const compressed = await compressIconImage(file)
      const webp = webpUploadFile(compressed.blob, `lobby-mc-${mc.id}`)
      const prevUrl = mc.photo_url
      const publicUrl = await uploadLobbyMcPhoto(webp)
      updateMc(index, { photo_url: publicUrl })
      if (prevUrl && prevUrl !== publicUrl) {
        await removeLobbyMcPhotoByPublicUrl(prevUrl).catch(() => undefined)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MC photo upload failed.')
    } finally {
      setUploadingMcId(null)
    }
  }

  async function removeMcPhoto(index: 0 | 1) {
    const mc = form.mcs[index]
    const prevUrl = mc.photo_url
    updateMc(index, { photo_url: null })
    if (prevUrl) {
      await removeLobbyMcPhotoByPublicUrl(prevUrl).catch(() => undefined)
    }
  }

  async function handleHeaderLogoUpload(file: File) {
    if (!isAcceptedImageFile(file)) {
      setError('Please choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_ICON_UPLOAD_BYTES) {
      setError(`Image must be under ${prettyMb(MAX_ICON_UPLOAD_BYTES)}.`)
      return
    }

    setUploadingHeaderLogo(true)
    setError(null)
    try {
      const compressed = await compressIconImage(file)
      const webp = webpUploadFile(compressed.blob, 'lobby-header-logo')
      const prevUrl = form.header_logo_url
      const publicUrl = await uploadLobbyHeaderLogo(webp)
      setForm((prev) => ({ ...prev, header_logo_url: publicUrl }))
      if (prevUrl && prevUrl !== publicUrl) {
        await removeLobbyHeaderLogoByPublicUrl(prevUrl).catch(() => undefined)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Header logo upload failed.')
    } finally {
      setUploadingHeaderLogo(false)
    }
  }

  async function removeHeaderLogo() {
    const prevUrl = form.header_logo_url
    setForm((prev) => ({ ...prev, header_logo_url: null }))
    if (prevUrl) {
      await removeLobbyHeaderLogoByPublicUrl(prevUrl).catch(() => undefined)
    }
  }

  async function handleHeroBackgroundUpload(file: File) {
    if (!isAcceptedImageFile(file)) {
      setError('Please choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError(`Image must be under ${prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.`)
      return
    }

    setUploadingHeroBackground(true)
    setError(null)
    try {
      const compressed = await compressPhotoImage(file)
      const webp = webpUploadFile(compressed.blob, 'lobby-hero-background')
      const prevUrl = form.hero_background_url
      const publicUrl = await uploadLobbyHeroBackground(webp)
      setForm((prev) => ({ ...prev, hero_background_url: publicUrl }))
      if (prevUrl && prevUrl !== publicUrl) {
        await removeLobbyHeroBackgroundByPublicUrl(prevUrl).catch(() => undefined)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hero background upload failed.')
    } finally {
      setUploadingHeroBackground(false)
    }
  }

  async function removeHeroBackground() {
    const prevUrl = form.hero_background_url
    setForm((prev) => ({ ...prev, hero_background_url: null }))
    if (prevUrl) {
      await removeLobbyHeroBackgroundByPublicUrl(prevUrl).catch(() => undefined)
    }
  }

  return (
    <div className="admin-page-shell flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <p className="sr-only" aria-live="polite">
        {error ?? ''} {success ?? ''}
      </p>

      <div className="admin-page-controls flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="admin-page-title text-zinc-900">Lobby</h1>
              <p className="admin-gap-page-title-intro admin-intro">
                Configure the guest home page — hero copy, module order, event program, and MCs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || loading}
              className={`${GRADIENT_BTN} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </header>

        <section className="admin-gap-intro-first-section flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-2xl border-x border-t border-[#ebebeb] bg-white">
          <div className="space-y-8 p-5">
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {success}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-4" aria-busy="true">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
                ))}
              </div>
            ) : (
              <>
                {/* Hero editor */}
                <div className="rounded-2xl border border-[#ebebeb] p-5">
                  <h2 className="text-[16px] font-semibold text-zinc-900">Hero section</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Welcome title, description, call-to-action labels, header logo, and hero
                    background.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">
                        Header logo
                      </span>
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="flex min-h-[80px] min-w-[120px] max-w-[250px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          {form.header_logo_url?.trim() ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={form.header_logo_url.trim()}
                              alt=""
                              className="max-w-[250px] w-full object-contain"
                            />
                          ) : (
                            <span className="text-xs text-zinc-400">No logo uploaded</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="inline-flex cursor-pointer items-center rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-800 hover:bg-zinc-50">
                            {uploadingHeaderLogo ? 'Uploading…' : 'Upload logo'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              disabled={uploadingHeaderLogo}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                e.target.value = ''
                                if (file) void handleHeaderLogoUpload(file)
                              }}
                            />
                          </label>
                          {form.header_logo_url?.trim() ? (
                            <button
                              type="button"
                              onClick={() => void removeHeaderLogo()}
                              className="text-left text-[12px] font-medium text-red-600 hover:underline"
                            >
                              Remove logo
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">
                        Hero background banner
                      </span>
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="h-28 w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 sm:h-32">
                          {form.hero_background_url?.trim() ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={form.hero_background_url.trim()}
                              alt=""
                              className="h-full w-full object-cover object-center"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                              No background uploaded
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="inline-flex cursor-pointer items-center rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-800 hover:bg-zinc-50">
                            {uploadingHeroBackground ? 'Uploading…' : 'Upload background'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              disabled={uploadingHeroBackground}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                e.target.value = ''
                                if (file) void handleHeroBackgroundUpload(file)
                              }}
                            />
                          </label>
                          {form.hero_background_url?.trim() ? (
                            <button
                              type="button"
                              onClick={() => void removeHeroBackground()}
                              className="text-left text-[12px] font-medium text-red-600 hover:underline"
                            >
                              Remove background
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <label className="block md:col-span-2">
                      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">
                        Hero title
                      </span>
                      <input
                        className={INPUT_CLASS}
                        value={form.hero.title}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            hero: { ...prev.hero, title: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">
                        Hero description
                      </span>
                      <textarea
                        rows={3}
                        className={TEXTAREA_CLASS}
                        value={form.hero.description}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            hero: { ...prev.hero, description: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">
                        “Find My Seat” button label
                      </span>
                      <input
                        className={INPUT_CLASS}
                        value={form.hero.cta_find_seat_label}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            hero: { ...prev.hero, cta_find_seat_label: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">
                        “See the Program” button label
                      </span>
                      <input
                        className={INPUT_CLASS}
                        value={form.hero.cta_program_label}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            hero: { ...prev.hero, cta_program_label: e.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>

                {/* Modules */}
                <div className="rounded-2xl border border-[#ebebeb] p-5">
                  <h2 className="text-[16px] font-semibold text-zinc-900">Modules</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Reorder, enable or disable sections, and edit section titles.
                  </p>
                  <div className="mt-4 space-y-3">
                    {form.modules_order.map((id, index) => {
                      const mod = form.modules[id]
                      const canMoveUp = index > 0
                      const canMoveDown = index < form.modules_order.length - 1
                      return (
                        <div
                          key={id}
                          className="rounded-xl border border-[#ebebeb] bg-[#fdfdfd] p-4"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                disabled={!canMoveUp}
                                onClick={() => moveModule(index, 'up')}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-800 disabled:opacity-40"
                                aria-label={`Move ${lobbyModuleLabel(id)} up`}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={!canMoveDown}
                                onClick={() => moveModule(index, 'down')}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-800 disabled:opacity-40"
                                aria-label={`Move ${lobbyModuleLabel(id)} down`}
                              >
                                ↓
                              </button>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[13px] font-semibold text-zinc-500">
                                  {lobbyModuleLabel(id)}
                                </span>
                                <label className="inline-flex items-center gap-2 text-[13px] text-zinc-700">
                                  <input
                                    type="checkbox"
                                    checked={mod.enabled}
                                    onChange={(e) =>
                                      updateModule(id, { enabled: e.target.checked })
                                    }
                                    className="h-4 w-4 rounded border-zinc-300"
                                  />
                                  Enabled
                                </label>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <label className="block">
                                  <span className="mb-1 block text-[12px] font-medium text-zinc-600">
                                    Section title
                                  </span>
                                  <input
                                    className={INPUT_CLASS}
                                    value={mod.title}
                                    onChange={(e) =>
                                      updateModule(id, { title: e.target.value })
                                    }
                                  />
                                </label>
                                <label className="block md:col-span-2">
                                  <span className="mb-1 block text-[12px] font-medium text-zinc-600">
                                    Section description (optional)
                                  </span>
                                  <textarea
                                    rows={2}
                                    className={TEXTAREA_CLASS}
                                    value={mod.description ?? ''}
                                    onChange={(e) =>
                                      updateModule(id, {
                                        description: e.target.value.trim() || null,
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Event program */}
                <div className="rounded-2xl border border-[#ebebeb] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[16px] font-semibold text-zinc-900">Event program</h2>
                      <p className="mt-1 text-sm text-zinc-500">
                        Timeline items shown in the Event Program module.
                      </p>
                    </div>
                    <button type="button" onClick={addProgramItem} className={GRADIENT_BTN}>
                      Add item
                    </button>
                  </div>

                  {form.event_program.length === 0 ? (
                    <p className="mt-4 text-sm text-zinc-500">No program items yet.</p>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {form.event_program.map((item, index) => {
                        const canMoveUp = index > 0
                        const canMoveDown = index < form.event_program.length - 1
                        return (
                          <div
                            key={item.id}
                            className={`grid grid-cols-1 gap-3 rounded-xl border border-[#ebebeb] p-3 md:grid-cols-[auto_1fr_auto] md:items-start ${
                              index % 2 === 0 ? 'bg-white' : 'bg-neutral-50/80'
                            }`}
                          >
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={!canMoveUp}
                                onClick={() => moveProgramItem(index, 'up')}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold disabled:opacity-40"
                                aria-label="Move program item up"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={!canMoveDown}
                                onClick={() => moveProgramItem(index, 'down')}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold disabled:opacity-40"
                                aria-label="Move program item down"
                              >
                                ↓
                              </button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="block">
                                <span className="mb-1 block text-[12px] font-medium text-zinc-600">
                                  Time
                                </span>
                                <input
                                  className={INPUT_CLASS}
                                  value={item.time}
                                  onChange={(e) =>
                                    updateProgramItem(item.id, { time: e.target.value })
                                  }
                                />
                              </label>
                              <label className="block sm:col-span-2">
                                <span className="mb-1 block text-[12px] font-medium text-zinc-600">
                                  Activity title
                                </span>
                                <input
                                  className={INPUT_CLASS}
                                  value={item.title}
                                  onChange={(e) =>
                                    updateProgramItem(item.id, { title: e.target.value })
                                  }
                                />
                              </label>
                              <label className="block sm:col-span-2">
                                <span className="mb-1 block text-[12px] font-medium text-zinc-600">
                                  Description (optional)
                                </span>
                                <textarea
                                  rows={2}
                                  className={TEXTAREA_CLASS}
                                  value={item.description ?? ''}
                                  onChange={(e) =>
                                    updateProgramItem(item.id, {
                                      description: e.target.value.trim() || null,
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeProgramItem(item.id)}
                              className="inline-flex h-8 items-center rounded-full border border-red-200 px-3 text-[12px] font-medium text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* MCs */}
                <div className="rounded-2xl border border-[#ebebeb] p-5">
                  <h2 className="text-[16px] font-semibold text-zinc-900">MCs</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Photos, names, and descriptions for the two MC cards.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {([0, 1] as const).map((index) => {
                      const mc = form.mcs[index]
                      const photo = mc.photo_url?.trim()
                      const busy = uploadingMcId === mc.id
                      return (
                        <div
                          key={mc.id}
                          className="rounded-xl border border-[#ebebeb] bg-[#fdfdfd] p-4"
                        >
                          <p className="text-[13px] font-semibold text-zinc-500">
                            MC {index + 1}
                          </p>
                          <div className="mt-3 flex items-start gap-4">
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                              {photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={photo}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-2xl">
                                  🎤
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="inline-flex cursor-pointer items-center rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-800 hover:bg-zinc-50">
                                {busy ? 'Uploading…' : 'Upload photo'}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="sr-only"
                                  disabled={busy}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    e.target.value = ''
                                    if (file) void handleMcPhotoUpload(index, file)
                                  }}
                                />
                              </label>
                              {photo ? (
                                <button
                                  type="button"
                                  onClick={() => void removeMcPhoto(index)}
                                  className="text-left text-[12px] font-medium text-red-600 hover:underline"
                                >
                                  Remove photo
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <label className="mt-4 block">
                            <span className="mb-1 block text-[12px] font-medium text-zinc-600">
                              Name
                            </span>
                            <input
                              className={INPUT_CLASS}
                              value={mc.name}
                              onChange={(e) => updateMc(index, { name: e.target.value })}
                            />
                          </label>
                          <label className="mt-3 block">
                            <span className="mb-1 block text-[12px] font-medium text-zinc-600">
                              Description
                            </span>
                            <textarea
                              rows={3}
                              className={TEXTAREA_CLASS}
                              value={mc.description}
                              onChange={(e) =>
                                updateMc(index, { description: e.target.value })
                              }
                            />
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex justify-end pb-4">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    className={`${GRADIENT_BTN} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
