'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { resolvePresenterImageUrl } from '@/lib/display-slide-assets'
import {
  createDisplaySlide,
  deleteDisplaySlide,
  fetchDisplaySlides,
  normalizeDisplaySlideRow,
  SLIDE_BG_PRESETS,
  updateDisplaySlide,
  type DisplaySlideRow,
  type DisplaySlideSpeaker,
} from '@/lib/display-slides'
import {
  setActiveDisplaySlide,
  setDisplayOverlayMode,
} from '@/lib/display-settings'
import {
  assertMaxFileSize,
  compressAvatarImage,
  isAcceptedImageFile,
} from '@/lib/image-compress'
import { supabase } from '@/lib/supabase/client'

type SpeakerDraft = {
  key: string
  name: string
  image_url: string
  imageFile: File | null
  imagePreview: string | null
}

type SlideFormState = {
  bg_color: string
  eyebrow: string
  title: string
  speakers: SpeakerDraft[]
}

const EMPTY_FORM: SlideFormState = {
  bg_color: SLIDE_BG_PRESETS[0].color,
  eyebrow: '',
  title: '',
  speakers: [{ key: 's-0', name: '', image_url: '', imageFile: null, imagePreview: null }],
}

function newSpeakerDraft(): SpeakerDraft {
  return {
    key: `s-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    name: '',
    image_url: '',
    imageFile: null,
    imagePreview: null,
  }
}

function revokePreview(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function slideToForm(slide: DisplaySlideRow): SlideFormState {
  return {
    bg_color: slide.bg_color,
    eyebrow: slide.eyebrow,
    title: slide.title,
    speakers:
      slide.speakers.length > 0
        ? slide.speakers.map((speaker) => ({
            key: `s-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
            name: speaker.name,
            image_url: speaker.image_url,
            imageFile: null,
            imagePreview: null,
          }))
        : [newSpeakerDraft()],
  }
}

function speakerSummary(speakers: DisplaySlideSpeaker[]): string {
  const names = speakers.map((s) => s.name.trim()).filter(Boolean)
  if (names.length === 0) return 'No presenters'
  if (names.length <= 2) return names.join(' & ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

type Props = {
  activeMode: string
  activeSlideId: string | null
  onActivated: (message: string) => void
  onError: (message: string) => void
}

export function SlideBuilderSection({
  activeMode,
  activeSlideId,
  onActivated,
  onError,
}: Props) {
  const [slides, setSlides] = useState<DisplaySlideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingSlide, setEditingSlide] = useState<DisplaySlideRow | null>(null)
  const [form, setForm] = useState<SlideFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const customHexRef = useRef<HTMLInputElement>(null)

  const loadSlides = useCallback(async () => {
    try {
      const rows = await fetchDisplaySlides()
      setSlides(rows)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to load slides.')
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void loadSlides()
  }, [loadSlides])

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    let resubscribeTimer: number | null = null

    const applySlidePayload = (payload: {
      eventType: string
      new: Record<string, unknown>
      old: Record<string, unknown>
    }) => {
      if (cancelled) return

      if (payload.eventType === 'DELETE') {
        const deletedId =
          typeof payload.old.id === 'string' ? payload.old.id : null
        if (!deletedId) return
        setSlides((prev) => prev.filter((slide) => slide.id !== deletedId))
        return
      }

      const slide = normalizeDisplaySlideRow(payload.new)
      if (!slide) return

      setSlides((prev) => {
        const index = prev.findIndex((row) => row.id === slide.id)
        if (index === -1) return [slide, ...prev]
        const next = [...prev]
        next[index] = slide
        return next
      })
    }

    const attach = () => {
      if (cancelled) return

      channel = supabase
        .channel('display-control-slides')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'display_slides' },
          (payload) => {
            applySlidePayload({
              eventType: 'INSERT',
              new: payload.new as Record<string, unknown>,
              old: {},
            })
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'display_slides' },
          (payload) => {
            applySlidePayload({
              eventType: 'UPDATE',
              new: payload.new as Record<string, unknown>,
              old: {},
            })
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'display_slides' },
          (payload) => {
            applySlidePayload({
              eventType: 'DELETE',
              new: {},
              old: payload.old as Record<string, unknown>,
            })
          }
        )
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (channel) {
              supabase.removeChannel(channel)
              channel = null
            }
            resubscribeTimer = window.setTimeout(attach, 2_000)
          }
        })
    }

    attach()

    return () => {
      cancelled = true
      if (resubscribeTimer) window.clearTimeout(resubscribeTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  function resetForm(next?: SlideFormState) {
    for (const speaker of form.speakers) {
      revokePreview(speaker.imagePreview)
    }
    setForm(next ?? { ...EMPTY_FORM, speakers: [newSpeakerDraft()] })
  }

  function openCreate() {
    resetForm()
    setEditingSlide(null)
    setShowCreateForm(true)
  }

  function openEdit(slide: DisplaySlideRow) {
    resetForm(slideToForm(slide))
    setEditingSlide(slide)
    setShowCreateForm(true)
  }

  function closeForm() {
    resetForm()
    setEditingSlide(null)
    setShowCreateForm(false)
  }

  function updateSpeaker(key: string, patch: Partial<SpeakerDraft>) {
    setForm((prev) => ({
      ...prev,
      speakers: prev.speakers.map((speaker) =>
        speaker.key === key ? { ...speaker, ...patch } : speaker
      ),
    }))
  }

  function addSpeaker() {
    setForm((prev) => ({
      ...prev,
      speakers: [...prev.speakers, newSpeakerDraft()],
    }))
  }

  function removeSpeaker(key: string) {
    setForm((prev) => {
      if (prev.speakers.length <= 1) return prev
      const target = prev.speakers.find((s) => s.key === key)
      revokePreview(target?.imagePreview ?? null)
      return {
        ...prev,
        speakers: prev.speakers.filter((s) => s.key !== key),
      }
    })
  }

  async function handleSpeakerFile(key: string, file: File | null) {
    if (!file) return
    if (!isAcceptedImageFile(file)) {
      onError('Please choose a JPEG, PNG, or WebP image.')
      return
    }
    try {
      assertMaxFileSize(file)
      const speaker = form.speakers.find((s) => s.key === key)
      revokePreview(speaker?.imagePreview ?? null)
      const preview = URL.createObjectURL(file)
      updateSpeaker(key, { imageFile: file, imagePreview: preview, image_url: '' })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Invalid image file.')
    }
  }

  async function resolveSpeakers(): Promise<DisplaySlideSpeaker[]> {
    const resolved: DisplaySlideSpeaker[] = []
    for (const speaker of form.speakers) {
      let image_url = speaker.image_url.trim()
      if (speaker.imageFile) {
        const compressed = await compressAvatarImage(speaker.imageFile)
        image_url = await resolvePresenterImageUrl(compressed.blob, compressed.contentType)
      } else if (!image_url && speaker.imagePreview) {
        image_url = speaker.imagePreview
      }
      resolved.push({
        name: speaker.name.trim(),
        image_url,
      })
    }
    return resolved.filter((s) => s.name || s.image_url)
  }

  async function saveSlide() {
    setSaving(true)
    try {
      const speakers = await resolveSpeakers()
      const payload = {
        bg_color: form.bg_color,
        eyebrow: form.eyebrow,
        title: form.title,
        speakers,
      }

      if (editingSlide) {
        await updateDisplaySlide(editingSlide.id, payload)
        onActivated('Slide updated.')
      } else {
        await createDisplaySlide(payload)
        onActivated('Slide created.')
      }

      closeForm()
      await loadSlides()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save slide.')
    } finally {
      setSaving(false)
    }
  }

  async function activateLeaderboard() {
    setPendingId('leaderboard')
    try {
      await setDisplayOverlayMode('leaderboard')
      onActivated('Live Leaderboard & Feed is now live on the big screen.')
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to activate leaderboard.')
    } finally {
      setPendingId(null)
    }
  }

  async function activateSlide(slide: DisplaySlideRow) {
    setPendingId(slide.id)
    try {
      await setActiveDisplaySlide(slide.id)
      onActivated(`"${slide.title.trim() || 'Presenter slide'}" is now live on the big screen.`)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to activate slide.')
    } finally {
      setPendingId(null)
    }
  }

  async function confirmDelete(slide: DisplaySlideRow) {
    if (activeMode === 'slide' && activeSlideId === slide.id) {
      onError('Cannot delete a slide that is currently live on screen.')
      setDeleteConfirmId(null)
      return
    }

    setPendingId(slide.id)
    try {
      await deleteDisplaySlide(slide.id)
      setDeleteConfirmId(null)
      onActivated('Slide deleted.')
      await loadSlides()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete slide.')
    } finally {
      setPendingId(null)
    }
  }

  const isLeaderboardLive = activeMode === 'leaderboard'

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden>
            🏆
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-zinc-900">Live Leaderboard & Feed</p>
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                Locked
              </span>
              {isLeaderboardLive ? (
                <span className="rounded-full bg-[#5b38f2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Live
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Default preset — greetings carousel, momentum feed, and live scores.
            </p>
            <button
              type="button"
              disabled={pendingId === 'leaderboard' || isLeaderboardLive}
              onClick={() => void activateLeaderboard()}
              className="mt-3 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {pendingId === 'leaderboard'
                ? 'Activating…'
                : isLeaderboardLive
                  ? 'Currently Live'
                  : 'Activate on Screen'}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={openCreate}
        className="rounded-2xl border border-dashed border-[#5b38f2]/40 bg-[#5b38f2]/5 px-4 py-4 text-left transition hover:border-[#5b38f2]/60 hover:bg-[#5b38f2]/8"
      >
        <p className="text-base font-semibold text-[#5b38f2]">+ Create New Slide</p>
        <p className="mt-1 text-sm text-zinc-600">
          Build a presenter slide with photos, eyebrow text, and title.
        </p>
      </button>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading slides…</p>
      ) : slides.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">
          No custom slides yet. Create one above.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {slides.map((slide) => {
            const isLive = activeMode === 'slide' && activeSlideId === slide.id
            const isPending = pendingId === slide.id
            return (
              <div
                key={slide.id}
                className={`rounded-2xl border px-4 py-4 ${
                  isLive
                    ? 'border-[#5b38f2] bg-[#5b38f2]/8 shadow-[0_0_0_1px_rgba(91,56,242,0.25)]'
                    : 'border-zinc-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-10 w-10 shrink-0 rounded-xl border border-white/20 shadow-inner"
                    style={{ backgroundColor: slide.bg_color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-zinc-900">
                        {slide.title.trim() || 'Untitled slide'}
                      </p>
                      {isLive ? (
                        <span className="rounded-full bg-[#5b38f2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Live
                        </span>
                      ) : null}
                    </div>
                    {slide.eyebrow.trim() ? (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {slide.eyebrow.trim()}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-zinc-600">{speakerSummary(slide.speakers)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isPending || isLive}
                        onClick={() => void activateSlide(slide)}
                        className="rounded-xl bg-[#5b38f2] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#4a2fd4] disabled:opacity-50"
                      >
                        {isPending ? 'Activating…' : isLive ? 'Currently Live' : 'Activate on Screen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(slide)}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isLive}
                        onClick={() => setDeleteConfirmId(slide.id)}
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreateForm && typeof window !== 'undefined'
        ? createPortal(
            <SlideEditorDrawer
              editingSlide={editingSlide}
              form={form}
              saving={saving}
              customHexRef={customHexRef}
              onClose={closeForm}
              onSave={() => void saveSlide()}
              onFormChange={setForm}
              onSpeakerFile={(key, file) => void handleSpeakerFile(key, file)}
              onAddSpeaker={addSpeaker}
              onRemoveSpeaker={removeSpeaker}
              onUpdateSpeaker={updateSpeaker}
            />,
            document.body
          )
        : null}

      {deleteConfirmId && typeof window !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
                <p className="text-base font-semibold text-zinc-900">Delete this slide?</p>
                <p className="mt-2 text-sm text-zinc-600">
                  This cannot be undone. Active slides must be switched off first.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-medium text-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === deleteConfirmId}
                    onClick={() => {
                      const slide = slides.find((s) => s.id === deleteConfirmId)
                      if (slide) void confirmDelete(slide)
                    }}
                    className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

type DrawerProps = {
  editingSlide: DisplaySlideRow | null
  form: SlideFormState
  saving: boolean
  customHexRef: React.RefObject<HTMLInputElement | null>
  onClose: () => void
  onSave: () => void
  onFormChange: (next: SlideFormState) => void
  onSpeakerFile: (key: string, file: File | null) => void
  onAddSpeaker: () => void
  onRemoveSpeaker: (key: string) => void
  onUpdateSpeaker: (key: string, patch: Partial<SpeakerDraft>) => void
}

function SlideEditorDrawer({
  editingSlide,
  form,
  saving,
  customHexRef,
  onClose,
  onSave,
  onFormChange,
  onSpeakerFile,
  onAddSpeaker,
  onRemoveSpeaker,
  onUpdateSpeaker,
}: DrawerProps) {
  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-black/40">
      <button
        type="button"
        aria-label="Close editor"
        className="min-h-[10vh] flex-1"
        onClick={onClose}
      />
      <div className="max-h-[90vh] overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white px-4 pb-8 pt-5 shadow-2xl sm:mx-auto sm:mb-6 sm:max-w-lg sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            {editingSlide ? 'Edit Slide' : 'Create New Slide'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Background color</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {SLIDE_BG_PRESETS.map((preset) => {
              const active = form.bg_color.toLowerCase() === preset.color.toLowerCase()
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onFormChange({ ...form, bg_color: preset.color })}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-medium transition ${
                    active
                      ? 'border-[#5b38f2] bg-[#5b38f2]/8 text-[#5b38f2]'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-md border border-black/10"
                    style={{ backgroundColor: preset.color }}
                    aria-hidden
                  />
                  {preset.label}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              ref={customHexRef}
              type="color"
              value={form.bg_color}
              onChange={(e) => onFormChange({ ...form, bg_color: e.target.value })}
              className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1"
              aria-label="Custom background color"
            />
            <input
              value={form.bg_color}
              onChange={(e) => onFormChange({ ...form, bg_color: e.target.value })}
              className="flex-1 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-mono uppercase text-zinc-800"
              placeholder="#0f172a"
            />
          </div>
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-zinc-800">Eyebrow text</span>
          <input
            value={form.eyebrow}
            onChange={(e) => onFormChange({ ...form, eyebrow: e.target.value })}
            placeholder='e.g. "Next Speaker", "Toast"'
            className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-3 text-base text-zinc-900 outline-none focus:border-[#5b38f2]"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-zinc-800">Slide title</span>
          <input
            value={form.title}
            onChange={(e) => onFormChange({ ...form, title: e.target.value })}
            placeholder='e.g. "Best Man & Maid of Honor"'
            className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-3 text-base text-zinc-900 outline-none focus:border-[#5b38f2]"
          />
        </label>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-zinc-800">Presenters</span>
            <button
              type="button"
              onClick={onAddSpeaker}
              className="text-sm font-medium text-[#5b38f2]"
            >
              + Add presenter
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {form.speakers.map((speaker, index) => (
              <div
                key={speaker.key}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Presenter {index + 1}
                  </p>
                  {form.speakers.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onRemoveSpeaker(speaker.key)}
                      className="text-xs font-medium text-red-600"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  value={speaker.name}
                  onChange={(e) => onUpdateSpeaker(speaker.key, { name: e.target.value })}
                  placeholder="Name"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#5b38f2]"
                />
                <div className="mt-2 flex items-center gap-3">
                  {(speaker.imagePreview || speaker.image_url) ? (
                    <img
                      src={speaker.imagePreview || speaker.image_url}
                      alt=""
                      className="h-14 w-14 rounded-full border border-zinc-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-zinc-300 bg-white text-xs text-zinc-400">
                      Photo
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <label className="inline-flex cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
                      Upload photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          void onSpeakerFile(speaker.key, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <input
                      value={speaker.image_url}
                      onChange={(e) =>
                        onUpdateSpeaker(speaker.key, {
                          image_url: e.target.value,
                          imageFile: null,
                          imagePreview: null,
                        })
                      }
                      placeholder="Or paste image URL"
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#5b38f2]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 px-4 py-8 text-center"
          style={{ backgroundColor: form.bg_color }}
        >
          {form.eyebrow.trim() ? (
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/55">
              {form.eyebrow.trim()}
            </p>
          ) : null}
          {form.title.trim() ? (
            <p className="mt-2 text-lg font-semibold text-white">{form.title.trim()}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {form.speakers.map((speaker) => (
              <div key={speaker.key} className="flex flex-col items-center">
                {(speaker.imagePreview || speaker.image_url) ? (
                  <img
                    src={speaker.imagePreview || speaker.image_url}
                    alt=""
                    className="h-16 w-16 rounded-full border-2 border-white/20 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-sm text-white/70">
                    ?
                  </div>
                )}
                {speaker.name.trim() ? (
                  <p className="mt-2 text-sm text-white/85">{speaker.name.trim()}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="mt-5 w-full rounded-xl bg-[#5b38f2] px-4 py-3.5 text-base font-semibold text-white transition hover:bg-[#4a2fd4] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editingSlide ? 'Save Changes' : 'Create Slide'}
        </button>
      </div>
    </div>
  )
}
