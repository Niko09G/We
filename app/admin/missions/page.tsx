'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  adminValidationTypeLabel,
  APPROVAL_MODES,
  createMission,
  listMissions,
  updateMission,
  VALIDATION_TYPES,
  type MissionRecord,
  type ValidationType,
} from '@/lib/admin-missions'
import { listActiveMissionAssignmentsForAdmin } from '@/lib/admin-mission-assignments'
import { missionTypeIcon } from '@/app/admin/missions/_components/mission-admin-shared'
import {
  MissionOverlaySplitPreviews,
  previewGradientForMissionForm,
  type MissionPreviewInput,
} from '@/app/admin/missions/_components/MissionLivePreview'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import {
  MISSION_CARD_BACKGROUNDS,
  MISSION_CARD_THEME_LABELS,
  firstStopColorFromMissionGradient,
} from '@/lib/guest-missions-gradients'
import {
  removeMissionImageAssetByPublicUrl,
  uploadMissionCardCoverAsset,
  uploadMissionImageAsset,
} from '@/lib/mission-image-assets'
import { MAX_IMAGE_UPLOAD_BYTES, prettyMb } from '@/lib/upload-constraints'
import { clamp, normalizeHex, hexToHsv, hsvToHex } from '@/lib/admin-color-picker'
import {
  missionGradientCssFromTriple,
  tripleStopsFromGradientCss,
} from '@/lib/mission-gradient-stops'
import {
  AdminBuilderColorPickerPortal,
  computePickerAnchorPosition,
} from '@/app/admin/_components/AdminBuilderColorPickerPortal'
import {
  AdminBuilderShellHeader,
  BUILDER_PROGRESS_ACTIVE_CLASS,
  BUILDER_PROGRESS_INACTIVE_CLASS,
} from '@/app/admin/_components/AdminBuilderShellHeader'

type MissionView = 'cards' | 'list'
type MissionStatusFilter = 'all' | 'active' | 'inactive' | 'archived'
type MissionStep = 1 | 2 | 3 | 4

type MissionGradDotKey = 'gradTop' | 'gradMid' | 'gradBottom'

type MissionForm = {
  title: string
  description: string
  header_image_url: string
  card_cover_image_url: string
  /** `null` = auto / unset in DB (guest list picks gradient by title). */
  card_theme_index: number | null
  points: string
  validation_type: ValidationType
  approval_mode: 'auto' | 'manual'
  message_required: boolean
  submission_hint: string
  is_active: boolean
}

const CATEGORY_DESCRIPTIONS: Record<ValidationType, string> = {
  photo: 'Submit a photo',
  video: 'Record a video',
  text: 'Written response',
  signature: 'Get someone to confirm',
  beatcoin: 'Hidden collectible / token',
}

const MISSION_BUILDER_GRADIENT_HOVER =
  'hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] hover:text-white'

const MISSION_STEP2_UPLOAD_HOVER =
  'hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] hover:text-white'

function parseHexRgb(input: string): { r: number; g: number; b: number } | null {
  let h = input.trim()
  if (h.startsWith('#')) h = h.slice(1)
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function colorDistanceSq(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2
}

function nearestMissionThemeIndexFromHex(hexInput: string): number {
  const raw = hexInput.trim()
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  const target = parseHexRgb(withHash)
  if (!target) return 0
  let bestI = 0
  let bestD = Infinity
  for (let i = 0; i < MISSION_CARD_BACKGROUNDS.length; i++) {
    const stop = firstStopColorFromMissionGradient(MISSION_CARD_BACKGROUNDS[i]!)
    const rgb = parseHexRgb(stop)
    if (!rgb) continue
    const d = colorDistanceSq(target, rgb)
    if (d < bestD) {
      bestD = d
      bestI = i
    }
  }
  return bestI
}

const MISSION_STEP2_SECONDARY_BTN =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-all duration-200 ease-out hover:bg-zinc-50'

function RemoveImageIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function emptyForm(): MissionForm {
  return {
    title: '',
    description: '',
    header_image_url: '',
    card_cover_image_url: '',
    card_theme_index: null,
    points: '10',
    validation_type: 'photo',
    approval_mode: 'auto',
    message_required: false,
    submission_hint: '',
    is_active: true,
  }
}

function formFromMission(m: MissionRecord): MissionForm {
  const idx = m.card_theme_index
  const themeOk =
    typeof idx === 'number' && Number.isFinite(idx) && idx >= 0 && idx < MISSION_CARD_BACKGROUNDS.length
  return {
    title: m.title ?? '',
    description: m.description ?? '',
    header_image_url: m.header_image_url ?? '',
    card_cover_image_url: m.card_cover_image_url ?? '',
    card_theme_index: themeOk ? Math.floor(idx) : null,
    points: String(m.points ?? 0),
    validation_type: VALIDATION_TYPES.includes(m.validation_type as ValidationType)
      ? (m.validation_type as ValidationType)
      : 'photo',
    approval_mode: APPROVAL_MODES.includes(m.approval_mode as 'auto' | 'manual')
      ? (m.approval_mode as 'auto' | 'manual')
      : 'auto',
    message_required: m.message_required ?? false,
    submission_hint: m.submission_hint ?? '',
    is_active: m.is_active ?? true,
  }
}

function missionStatusBadge(isActive: boolean): { label: string; className: string } {
  if (isActive) return { label: 'Active', className: 'bg-emerald-50 text-emerald-700' }
  return { label: 'Inactive', className: 'bg-zinc-100 text-zinc-600' }
}

function missionValidationIcon(type: ValidationType, className: string) {
  if (type === 'photo') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        <path d="M4 7h4l1.4-2h5.2L16 7h4v12H4z" />
        <circle cx="12" cy="13" r="3.2" />
      </svg>
    )
  }
  if (type === 'video') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="m17 10 4-2v8l-4-2z" />
      </svg>
    )
  }
  if (type === 'signature') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        <path d="m4 20 4.5-1 9.7-9.7a2.3 2.3 0 0 0-3.2-3.3L5.3 15.7z" />
        <path d="M13 7l3.8 3.8" />
      </svg>
    )
  }
  if (type === 'beatcoin') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        <circle cx="12" cy="12" r="8" />
        <path d="M9.2 12h5.6M12 9.2v5.6" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M7 4h8l4 4v12H7z" />
      <path d="M15 4v4h4M9 13h6M9 17h6" />
    </svg>
  )
}

export default function MissionsLibraryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [missions, setMissions] = useState<MissionRecord[]>([])
  const [assignmentsByMission, setAssignmentsByMission] = useState<Record<string, string[]>>({})
  const [tables, setTables] = useState<AdminTableRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MissionStatusFilter>('all')
  const [tableFilterId, setTableFilterId] = useState<string>('all')
  const [view, setView] = useState<MissionView>('cards')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [step, setStep] = useState<MissionStep>(1)
  const [step1Hint, setStep1Hint] = useState<string | null>(null)
  const [step2View, setStep2View] = useState<'main' | 'customize'>('main')
  const [step2GradientOverride, setStep2GradientOverride] = useState<string | null>(null)
  const [missionGradStops, setMissionGradStops] = useState<{
    top: string
    mid: string
    bottom: string
  }>(() => tripleStopsFromGradientCss(MISSION_CARD_BACKGROUNDS[0]!))
  const [openMissionColorKey, setOpenMissionColorKey] = useState<MissionGradDotKey | null>(null)
  const [missionColorPopoverPos, setMissionColorPopoverPos] = useState<{ left: number; top: number } | null>(
    null
  )
  const [pickerHsv, setPickerHsv] = useState<{ h: number; s: number; v: number }>({
    h: 260,
    s: 0.74,
    v: 0.98,
  })
  const [pickerHex, setPickerHex] = useState('#6d28ff')
  const [uploadSlot, setUploadSlot] = useState<'card' | 'overlay' | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<MissionForm>(emptyForm)
  const missionTitleInputRef = useRef<HTMLInputElement | null>(null)
  const missionDescInputRef = useRef<HTMLInputElement | null>(null)
  const cardCoverInputRef = useRef<HTMLInputElement | null>(null)
  const headerImageInputRef = useRef<HTMLInputElement | null>(null)
  const missionColorPickerRef = useRef<HTMLDivElement | null>(null)
  const missionSvPanelRef = useRef<HTMLDivElement | null>(null)
  const draggingMissionSvRef = useRef(false)
  const customizePanelWasOpenRef = useRef(false)

  const showToast = useCallback((message: string, kind: 'success' | 'error') => {
    setToast({ kind, message })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [toast])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mList, aMap, tList] = await Promise.all([
        listMissions(),
        listActiveMissionAssignmentsForAdmin(),
        listTablesForAdmin(),
      ])
      setMissions(mList)
      setAssignmentsByMission(aMap)
      setTables(tList.filter((t) => !t.is_archived))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load missions.'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!editorOpen || step !== 1) return
    const t = window.setTimeout(() => missionTitleInputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [editorOpen, step])

  useEffect(() => {
    if (!editorOpen || step !== 2 || step2View !== 'main') return
    const t = window.setTimeout(() => missionDescInputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [editorOpen, step, step2View])

  useEffect(() => {
    if (!editorOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (openMissionColorKey) {
        setOpenMissionColorKey(null)
        setMissionColorPopoverPos(null)
        return
      }
      if (step === 2 && step2View === 'customize') {
        setStep2View('main')
        return
      }
      setEditorOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editorOpen, openMissionColorKey, step, step2View])

  useEffect(() => {
    if (!openMissionColorKey) return
    const handlePointerDownCapture = (e: PointerEvent) => {
      const el = e.target
      if (!(el instanceof Element)) return
      if (el.closest('[data-mission-color-dot="true"]')) return
      if (el.closest('[data-admin-color-picker-root="true"]')) return
      if (missionColorPickerRef.current?.contains(el)) return
      setOpenMissionColorKey(null)
      setMissionColorPopoverPos(null)
    }
    document.addEventListener('pointerdown', handlePointerDownCapture, true)
    return () => document.removeEventListener('pointerdown', handlePointerDownCapture, true)
  }, [openMissionColorKey])

  useEffect(() => {
    if (step !== 2) setStep2View('main')
  }, [step])

  useEffect(() => {
    if (step2View === 'main') {
      setOpenMissionColorKey(null)
      setMissionColorPopoverPos(null)
    }
  }, [step2View])

  const missionStep2PreviewInput = useMemo<MissionPreviewInput>(
    () => ({
      title: form.title,
      points: Math.max(0, Math.floor(Number(form.points) || 0)),
      validation_type: form.validation_type,
      card_theme_choice: form.card_theme_index == null ? 'auto' : form.card_theme_index,
      card_cover_image_url: form.card_cover_image_url,
      header_image_url: form.header_image_url,
      description: form.description,
      gradient_preview_override: step2GradientOverride,
      card_cta_label: '',
      card_completed_label: '',
      cardCompleted: false,
      cardPending: false,
    }),
    [form, step2GradientOverride]
  )

  const cardCoverReady = form.card_cover_image_url.trim().length > 0
  const headerImageReady = form.header_image_url.trim().length > 0

  useEffect(() => {
    const on = step === 2 && step2View === 'customize'
    if (on && !customizePanelWasOpenRef.current) {
      const css = previewGradientForMissionForm(missionStep2PreviewInput)
      setMissionGradStops(tripleStopsFromGradientCss(css))
    }
    customizePanelWasOpenRef.current = on
  }, [step, step2View, missionStep2PreviewInput])

  const statusCounts = useMemo(() => {
    const active = missions.filter((m) => m.is_active).length
    const inactive = missions.filter((m) => !m.is_active).length
    return {
      all: missions.length,
      active,
      inactive,
      archived: 0,
    }
  }, [missions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return missions.filter((m) => {
      if (statusFilter === 'active' && !m.is_active) return false
      if (statusFilter === 'inactive' && m.is_active) return false
      if (statusFilter === 'archived') return false
      if (tableFilterId !== 'all') {
        const assigned = assignmentsByMission[m.id] ?? []
        if (!assigned.includes(tableFilterId)) return false
      }
      if (q) {
        const hay = `${m.title} ${m.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [missions, search, statusFilter, tableFilterId, assignmentsByMission])

  function openCreate() {
    setEditorMode('create')
    setEditingId(null)
    setStep(1)
    setStep1Hint(null)
    setStep2View('main')
    setStep2GradientOverride(null)
    setOpenMissionColorKey(null)
    setMissionColorPopoverPos(null)
    customizePanelWasOpenRef.current = false
    setForm(emptyForm())
    setEditorOpen(true)
  }

  function openEdit(mission: MissionRecord) {
    setEditorMode('edit')
    setEditingId(mission.id)
    setStep(1)
    setStep1Hint(null)
    setStep2View('main')
    setStep2GradientOverride(null)
    setOpenMissionColorKey(null)
    setMissionColorPopoverPos(null)
    customizePanelWasOpenRef.current = false
    setForm(formFromMission(mission))
    setEditorOpen(true)
  }

  async function uploadCardCover(file: File) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      showToast(`Image is too large. Max ${prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.`, 'error')
      return
    }
    setUploadSlot('card')
    try {
      const prev = form.card_cover_image_url.trim() || null
      const url = await uploadMissionCardCoverAsset(file)
      await removeMissionImageAssetByPublicUrl(prev)
      setForm((s) => ({ ...s, card_cover_image_url: url }))
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed.', 'error')
    } finally {
      setUploadSlot(null)
    }
  }

  async function uploadHeaderImage(file: File) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      showToast(`Image is too large. Max ${prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.`, 'error')
      return
    }
    setUploadSlot('overlay')
    try {
      const prev = form.header_image_url.trim() || null
      const url = await uploadMissionImageAsset(file)
      await removeMissionImageAssetByPublicUrl(prev)
      setForm((s) => ({ ...s, header_image_url: url }))
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed.', 'error')
    } finally {
      setUploadSlot(null)
    }
  }

  async function removeCardCoverImage() {
    const prev = form.card_cover_image_url.trim() || null
    setForm((s) => ({ ...s, card_cover_image_url: '' }))
    if (!prev) return
    try {
      await removeMissionImageAssetByPublicUrl(prev)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not remove image from storage.', 'error')
    }
  }

  async function removeHeaderMissionImage() {
    const prev = form.header_image_url.trim() || null
    setForm((s) => ({ ...s, header_image_url: '' }))
    if (!prev) return
    try {
      await removeMissionImageAssetByPublicUrl(prev)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not remove image from storage.', 'error')
    }
  }

  const updateMissionPickerColor = useCallback(
    (next: { h: number; s: number; v: number }) => {
      if (!openMissionColorKey) return
      const bounded = {
        h: clamp(next.h, 0, 360),
        s: clamp(next.s, 0, 1),
        v: clamp(next.v, 0, 1),
      }
      const hex = hsvToHex(bounded.h, bounded.s, bounded.v)
      setPickerHsv(bounded)
      setPickerHex(hex)
      setMissionGradStops((prev) => {
        const n = { ...prev }
        if (openMissionColorKey === 'gradTop') n.top = hex
        else if (openMissionColorKey === 'gradMid') n.mid = hex
        else n.bottom = hex
        queueMicrotask(() => {
          setStep2GradientOverride(missionGradientCssFromTriple(n.top, n.mid, n.bottom))
          setForm((s) => ({ ...s, card_theme_index: nearestMissionThemeIndexFromHex(n.top) }))
        })
        return n
      })
    },
    [openMissionColorKey]
  )

  const updateMissionSvFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!missionSvPanelRef.current) return
      const rect = missionSvPanelRef.current.getBoundingClientRect()
      const s = clamp((clientX - rect.left) / rect.width, 0, 1)
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
      updateMissionPickerColor({ h: pickerHsv.h, s, v })
    },
    [pickerHsv.h, updateMissionPickerColor]
  )

  const openMissionColorPicker = useCallback((key: MissionGradDotKey, el: HTMLButtonElement) => {
    const rawHex = key === 'gradTop' ? missionGradStops.top : key === 'gradMid' ? missionGradStops.mid : missionGradStops.bottom
    const currentHex = normalizeHex(rawHex) ?? '#6d28ff'
    setPickerHex(currentHex)
    setPickerHsv(hexToHsv(currentHex))
    setOpenMissionColorKey(key)
    setMissionColorPopoverPos(computePickerAnchorPosition(el))
  }, [missionGradStops.bottom, missionGradStops.mid, missionGradStops.top])

  useEffect(() => {
    if (!openMissionColorKey) return
    const handleMove = (e: MouseEvent) => {
      if (!draggingMissionSvRef.current) return
      updateMissionSvFromPointer(e.clientX, e.clientY)
    }
    const handleUp = () => {
      draggingMissionSvRef.current = false
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [openMissionColorKey, updateMissionSvFromPointer])

  function advanceFromStep1() {
    if (!form.title.trim()) {
      setStep1Hint("Let's choose a title first")
      return
    }
    setStep1Hint(null)
    setStep(2)
  }

  async function onSaveMission() {
    if (!form.title.trim()) {
      showToast('Add a mission title first.', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        points: Math.max(0, Math.floor(Number(form.points) || 0)),
        validation_type: form.validation_type,
        approval_mode: form.approval_mode,
        is_active: form.is_active,
        message_required: form.message_required,
        submission_hint: form.submission_hint.trim() || null,
        header_image_url: form.header_image_url.trim() || null,
        card_cover_image_url: form.card_cover_image_url.trim() || null,
        card_theme_index: form.card_theme_index,
      }
      if (editorMode === 'create') {
        await createMission(payload)
        showToast('Mission created.', 'success')
      } else if (editingId) {
        await updateMission(editingId, payload)
        showToast('Mission updated.', 'success')
      }
      setEditorOpen(false)
      await refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page-shell flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <p className="sr-only" aria-live="polite">
        {error ?? ''}
      </p>
      <div className="admin-page-controls flex flex-1 min-h-0 flex-col overflow-hidden">
        <header className="shrink-0">
          <h1 className="admin-page-title text-zinc-900">Missions</h1>
          <p className="admin-gap-page-title-intro admin-intro">
            Create and manage mission templates. Keep missions fast to scan and easy to publish.
          </p>
        </header>

        <section className="admin-gap-intro-first-section flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl border-x border-t border-[#ebebeb] bg-white">
          <div className="z-20 border-b border-[#ebebeb] bg-white p-4 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="relative w-full md:w-[360px]">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search missions..."
                    className="h-10 w-full rounded-full border border-[#ebebeb] bg-white pl-8 pr-[12px] text-[14px] font-normal text-[#171717] placeholder:text-[14px] placeholder:text-[#767676] outline-none transition-colors duration-150 ease-out focus:border-zinc-400"
                  />
                </div>

                <div className="inline-flex h-10 items-stretch overflow-hidden rounded-full border border-[#ebebeb] bg-white">
                  <button
                    type="button"
                    onClick={() => setView('cards')}
                    className={`inline-flex h-full items-center rounded-full px-[12px] text-[14px] font-medium transition-colors duration-150 ease-out ${
                      view === 'cards' ? 'bg-black text-white' : 'text-[#4d4d4d] hover:text-[#171717]'
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-1.5 h-3.5 w-3.5"
                      aria-hidden
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1.2" />
                      <rect x="14" y="3" width="7" height="7" rx="1.2" />
                      <rect x="3" y="14" width="7" height="7" rx="1.2" />
                      <rect x="14" y="14" width="7" height="7" rx="1.2" />
                    </svg>
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    className={`inline-flex h-full items-center rounded-full px-[12px] text-[14px] font-medium transition-colors duration-150 ease-out ${
                      view === 'list' ? 'bg-black text-white' : 'text-[#4d4d4d] hover:text-[#171717]'
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-1.5 h-3.5 w-3.5"
                      aria-hidden
                    >
                      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                    </svg>
                    List
                  </button>
                </div>

                <div className="relative">
                  <select
                    value={tableFilterId}
                    onChange={(e) => setTableFilterId(e.target.value)}
                    className="h-10 min-w-[170px] appearance-none rounded-full border border-[#ebebeb] bg-white px-[12px] pr-9 text-[14px] font-medium text-[#171717] outline-none transition-colors duration-150 ease-out focus:border-zinc-400"
                  >
                    <option value="all">All tables</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>

                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as MissionStatusFilter)}
                    className="h-10 min-w-[170px] appearance-none rounded-full border border-[#ebebeb] bg-white px-[12px] pr-9 text-[14px] font-medium text-[#171717] outline-none transition-colors duration-150 ease-out focus:border-zinc-400"
                  >
                    <option value="all">All missions ({statusCounts.all})</option>
                    <option value="active">Active ({statusCounts.active})</option>
                    <option value="inactive">Inactive ({statusCounts.inactive})</option>
                    <option value="archived">Archived ({statusCounts.archived})</option>
                  </select>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              <button
                type="button"
                onClick={openCreate}
                className="ml-auto inline-flex h-[40px] items-center gap-2 rounded-full bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>New mission</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="admin-scroll-area h-full overflow-y-auto px-4 pb-4 pt-4">
              {view === 'list' ? (
                <div className="admin-content-in space-y-1">
                  <div className="grid grid-cols-[1.5fr_0.8fr_0.7fr_0.9fr_1fr] gap-x-3 border-b border-[#ebebeb] px-3 pb-2 pt-[10px] text-[14px] font-medium text-[#18181b]">
                    <span>Mission</span>
                    <span>Type</span>
                    <span>Reward</span>
                    <span>Status</span>
                    <span>Submission / Review</span>
                  </div>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="grid min-h-[52px] grid-cols-[1.5fr_0.8fr_0.7fr_0.9fr_1fr] items-center gap-x-3 rounded-lg px-3 py-1.5"
                    >
                      <div className="inline-flex items-center gap-3">
                        <span className="admin-skeleton h-8 w-8 shrink-0 rounded-lg" />
                        <span className="admin-skeleton h-3.5 w-28 rounded-md" />
                      </div>
                      <span className="admin-skeleton h-3.5 w-16 rounded-md" />
                      <span className="admin-skeleton h-3.5 w-12 rounded-md" />
                      <span className="admin-skeleton h-6 w-16 rounded-full" />
                      <span className="admin-skeleton h-3.5 w-20 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-content-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-[250px] rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="admin-skeleton h-28 w-full rounded-xl" />
                      <div className="mt-3 space-y-2">
                        <div className="admin-skeleton h-4 w-32 rounded-md" />
                        <div className="admin-skeleton h-3.5 w-20 rounded-md" />
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="admin-skeleton h-6 w-16 rounded-full" />
                        <div className="admin-skeleton h-3.5 w-24 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : view === 'list' ? (
            <div className="admin-scroll-area admin-content-in h-full overflow-y-auto px-4 pb-4">
              <div className="sticky top-0 z-10 grid grid-cols-[1.5fr_0.8fr_0.7fr_0.9fr_1fr] gap-x-3 border-b border-[#ebebeb] bg-white px-3 pb-2 pt-[10px] text-[14px] font-medium text-[#18181b]">
                <span>Mission</span>
                <span>Type</span>
                <span>Reward</span>
                <span>Status</span>
                <span>Submission / Review</span>
              </div>
              {filtered.length === 0 ? (
                <div className="rounded-lg bg-white px-4 py-6 text-[14px] text-zinc-500">
                  No missions match your filters.
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((m, index) => {
                    const status = missionStatusBadge(m.is_active)
                    const rowBg =
                      index % 2 === 0 ? 'bg-[#fdfdfd] hover:bg-[#fafafa]' : 'bg-[#1f1f1f08] hover:bg-[#ededed]'
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => openEdit(m)}
                        className={`grid w-full min-h-[52px] cursor-pointer grid-cols-[1.5fr_0.8fr_0.7fr_0.9fr_1fr] items-center gap-x-3 rounded-lg px-3 py-1.5 text-left transition-colors ${rowBg}`}
                      >
                        <span className="inline-flex items-center gap-3">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-base" aria-hidden>
                            {missionTypeIcon(m.validation_type)}
                          </span>
                          <span className="truncate text-[14px] font-medium text-zinc-900">{m.title}</span>
                        </span>
                        <span className="text-[14px] text-zinc-700">
                          {adminValidationTypeLabel(m.validation_type as ValidationType)}
                        </span>
                        <span className="text-[14px] font-medium text-zinc-700 tabular-nums">{m.points}</span>
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[12px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                        <span className="text-[14px] text-zinc-600">
                          {m.approval_mode === 'manual' ? 'Manual review' : 'Auto approve'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="admin-scroll-area admin-content-in h-full overflow-y-auto px-4 pb-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={openCreate}
                  className="group relative flex h-[250px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white text-center transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
                >
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-800 transition-colors group-hover:bg-zinc-900 group-hover:text-white">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                      aria-hidden
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  <p className="mt-4 text-base font-semibold text-zinc-900">New mission</p>
                  <p className="mt-1 text-sm text-zinc-500">Create a mission template</p>
                </button>

                {filtered.map((m) => {
                  const status = missionStatusBadge(m.is_active)
                  const assignedCount = (assignmentsByMission[m.id] ?? []).length
                  const coverImage = m.card_cover_image_url?.trim() || m.header_image_url?.trim() || ''
                  const themeBg =
                    m.card_theme_index != null && MISSION_CARD_BACKGROUNDS[m.card_theme_index]
                      ? MISSION_CARD_BACKGROUNDS[m.card_theme_index]
                      : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #0ea5e9 100%)'
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => openEdit(m)}
                      className="group relative h-[320px] cursor-pointer overflow-hidden rounded-2xl border border-zinc-200 text-left transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
                      style={{ background: themeBg }}
                    >
                      {coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/20 to-black/70" />
                      <div className="relative flex h-full flex-col justify-between p-3 text-white">
                        <div>
                          <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm">
                            <span className="text-base" aria-hidden>
                              {missionTypeIcon(m.validation_type)}
                            </span>
                          </div>
                          <p className="mt-3 line-clamp-2 text-[16px] font-semibold leading-snug">{m.title}</p>
                          <p className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-white/95">
                            <span aria-hidden>🪙</span>
                            <span>{m.points} BeatCoin</span>
                          </p>
                        </div>
                        <div className="rounded-xl bg-black/35 px-3 py-2 backdrop-blur-sm">
                          <div className="flex items-center justify-between gap-2 text-[12px]">
                            <span className="inline-flex rounded-full bg-white/20 px-2 py-0.5 font-medium text-white">
                              {status.label}
                            </span>
                            <span className="text-white/90">
                              {m.approval_mode === 'manual' ? 'Manual review' : 'Auto approve'}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-white/80">
                            {assignedCount} tables assigned ·{' '}
                            {adminValidationTypeLabel(m.validation_type as ValidationType)}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {editorOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4"
              onMouseDown={(e) => {
                if (e.target !== e.currentTarget) return
                setEditorOpen(false)
              }}
            >
                      <div
                        className="admin-font relative z-10 flex h-[90vh] max-h-[900px] min-h-0 w-full max-w-[1080px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                <AdminBuilderShellHeader
                  title={editorMode === 'create' ? 'New mission' : 'Edit mission'}
                  onClose={() => setEditorOpen(false)}
                  center={
                    <div className="inline-flex items-center gap-1.5">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setStep(n as MissionStep)}
                          className={`h-1.5 w-10 rounded-full transition-colors duration-150 ${
                            step >= n ? BUILDER_PROGRESS_ACTIVE_CLASS : BUILDER_PROGRESS_INACTIVE_CLASS
                          }`}
                          aria-label={`Step ${n}`}
                        />
                      ))}
                    </div>
                  }
                />

                        <div className="relative flex h-full min-h-0 flex-1 flex-col items-center justify-start overflow-hidden [&_button]:cursor-pointer">
                          <input
                            ref={cardCoverInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null
                              e.currentTarget.value = ''
                              if (file) void uploadCardCover(file)
                            }}
                          />
                          <input
                            ref={headerImageInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null
                              e.currentTarget.value = ''
                              if (file) void uploadHeaderImage(file)
                            }}
                          />
                          <div
                            className={`flex h-full min-h-0 w-full max-w-full flex-1 flex-col items-center justify-start overflow-x-visible px-5 py-4 [&_input]:!text-[14px] [&_select]:!text-[14px] ${
                              step === 2 ? 'overflow-hidden pb-1' : 'overflow-y-auto pb-32'
                            }`}
                          >
                            <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-x-visible">
                              <div
                                className={`absolute inset-0 transition-all duration-200 ease-out ${
                                  step === 1 ? 'translate-x-0 opacity-100' : '-translate-x-3 pointer-events-none opacity-0'
                                }`}
                              >
                                <div className="flex min-h-full items-center justify-center py-2">
                                  <div className="w-full max-w-[760px] space-y-5 overflow-visible px-1.5">
                                    <h4 className="text-center text-3xl font-semibold tracking-tight text-zinc-900">
                                      What mission are we building?
                                    </h4>
                                    <div className="rounded-2xl bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] p-[1px] shadow-[0_0_0_1px_rgba(91,56,242,0.08),0_0_28px_rgba(28,160,216,0.18)]">
                                      <div
                                        className={`flex h-14 items-center gap-2 rounded-2xl bg-white pl-4 pr-2 transition-[box-shadow] duration-200 ease-out ${
                                          step1Hint ? 'shadow-[inset_0_0_0_1px_rgba(248,113,113,0.55)]' : ''
                                        }`}
                                      >
                                        <input
                                          ref={missionTitleInputRef}
                                          value={form.title}
                                          onChange={(e) => {
                                            setForm((s) => ({ ...s, title: e.target.value }))
                                            setStep1Hint(null)
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault()
                                              advanceFromStep1()
                                            }
                                          }}
                                          className="min-w-0 flex-1 bg-transparent !text-[16px] outline-none"
                                          placeholder="What's your mission called?"
                                        />
                                        <button
                                          type="button"
                                          onClick={advanceFromStep1}
                                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-sm transition-all duration-200 ease-out hover:scale-[1.04] hover:shadow-md active:scale-[0.96]"
                                          aria-label="Continue"
                                        >
                                          <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="h-4 w-4"
                                            aria-hidden
                                          >
                                            <path d="M5 12h14M13 6l6 6-6 6" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                    {step1Hint ? (
                                      <p className="px-1 text-center text-sm font-medium leading-snug text-zinc-600">
                                        {step1Hint}
                                      </p>
                                    ) : null}
                                    <p className="text-center text-[15px] font-semibold leading-snug text-zinc-900">
                                      Select mission category
                                    </p>
                                    <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                      {VALIDATION_TYPES.map((v) => {
                                        const selected = form.validation_type === v
                                        return (
                                          <button
                                            key={v}
                                            type="button"
                                            onClick={() => setForm((s) => ({ ...s, validation_type: v }))}
                                            className={`group flex w-full cursor-pointer flex-col rounded-xl border px-3.5 py-3.5 text-left transition-colors duration-200 ease-out ${
                                              selected
                                                ? 'border-transparent bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] text-white'
                                                : `border border-zinc-200 bg-white text-zinc-800 ${MISSION_BUILDER_GRADIENT_HOVER}`
                                            }`}
                                          >
                                            <span className="inline-flex items-center gap-2">
                                              <span
                                                className={
                                                  selected
                                                    ? 'text-white'
                                                    : 'text-zinc-500 transition-colors duration-200 ease-out group-hover:text-white'
                                                }
                                              >
                                                {missionValidationIcon(v, 'h-4 w-4 shrink-0')}
                                              </span>
                                              <span className="text-[14px] font-semibold leading-tight">
                                                {adminValidationTypeLabel(v)}
                                              </span>
                                            </span>
                                            <span
                                              className={`mt-1.5 text-[11px] font-medium leading-snug ${
                                                selected ? 'text-white/85' : 'text-zinc-500 group-hover:text-white/90'
                                              }`}
                                            >
                                              {CATEGORY_DESCRIPTIONS[v]}
                                            </span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div
                                className={`absolute inset-0 flex min-h-0 flex-col transition-all duration-200 ease-out ${
                                  step >= 2 ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-3 opacity-0'
                                }`}
                              >
                                <div
                                  className={`mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col overflow-x-visible py-3 ${
                                    step === 2 ? 'min-h-0 overflow-hidden pb-0' : 'overflow-y-auto pb-24'
                                  }`}
                                >
                    {step === 2 ? (
                      <div className="relative flex min-h-0 flex-1 flex-col">
                        <div className="relative min-h-0 flex-1 overflow-hidden">
                        <div
                          className={`absolute inset-0 flex min-h-0 flex-col overflow-hidden transition-all duration-200 ease-out ${
                            step2View === 'main'
                              ? 'z-10 translate-x-0 opacity-100'
                              : 'pointer-events-none z-0 -translate-x-2 opacity-0'
                          }`}
                        >
                          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible px-1 pb-2 pt-1">
                              <div className="flex flex-col items-center space-y-5">
                                <h4 className="text-center text-2xl font-semibold tracking-tight text-zinc-900">
                                  Card cover, overlay copy &amp; images
                                </h4>
                                <p className="max-w-lg px-2 text-center text-[13px] font-medium text-zinc-500">
                                  One line in the field below appears in the overlay preview as guest-facing body copy.
                                </p>
                                <div className="w-full max-w-[760px] rounded-2xl bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] p-[1px] shadow-[0_0_0_1px_rgba(91,56,242,0.08),0_0_28px_rgba(28,160,216,0.18)]">
                                  <label className="flex h-12 items-center rounded-2xl bg-white px-4">
                                    <input
                                      ref={missionDescInputRef}
                                      value={form.description}
                                      onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                                      className="w-full max-w-[680px] resize-none bg-transparent !text-[15px] outline-none"
                                      placeholder="Short line for the mission overlay (under the title)"
                                    />
                                  </label>
                                </div>
                                <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2.5">
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() => cardCoverInputRef.current?.click()}
                                      disabled={uploadSlot === 'card'}
                                      className={`group relative flex h-12 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-zinc-200/80 text-sm font-medium transition-all duration-200 ease-out disabled:opacity-60 ${
                                        uploadSlot === 'card' || cardCoverReady
                                          ? 'border-transparent bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] text-white'
                                          : `bg-zinc-50/90 text-zinc-800 ${MISSION_STEP2_UPLOAD_HOVER}`
                                      }`}
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={1.7}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className={`relative z-10 h-4 w-4 shrink-0 transition-colors duration-200 ease-out ${
                                          uploadSlot === 'card' || cardCoverReady
                                            ? 'text-white'
                                            : 'text-zinc-500 group-hover:text-white'
                                        }`}
                                        aria-hidden
                                      >
                                        <rect x="3" y="5" width="18" height="14" rx="2" />
                                        <circle cx="8.5" cy="10" r="1.2" />
                                        <path d="m21 15-6-5-4 4-3-3-5 5" />
                                      </svg>
                                      <span
                                        className={`relative z-10 transition-colors duration-200 ease-out ${
                                          uploadSlot === 'card' || cardCoverReady ? 'text-white' : 'group-hover:text-white'
                                        }`}
                                      >
                                        Card cover image
                                      </span>
                                      {uploadSlot === 'card' ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="absolute right-3 h-4 w-4 shrink-0 animate-spin text-white"
                                          aria-hidden
                                        >
                                          <path d="M21 12a9 9 0 1 1-3.2-6.9" />
                                        </svg>
                                      ) : cardCoverReady ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="absolute right-3 h-4 w-4 shrink-0 text-white"
                                          aria-hidden
                                        >
                                          <path d="m5 12 5 5L20 7" />
                                        </svg>
                                      ) : null}
                                    </button>
                                    {cardCoverReady && uploadSlot !== 'card' ? (
                                      <button
                                        type="button"
                                        onClick={() => void removeCardCoverImage()}
                                        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm transition-colors hover:bg-red-50"
                                        aria-label="Remove card cover image"
                                      >
                                        <RemoveImageIcon className="h-3 w-3" />
                                      </button>
                                    ) : null}
                                  </div>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() => headerImageInputRef.current?.click()}
                                      disabled={uploadSlot === 'overlay'}
                                      className={`group relative flex h-12 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-zinc-200/80 text-sm font-medium transition-all duration-200 ease-out disabled:opacity-60 ${
                                        uploadSlot === 'overlay' || headerImageReady
                                          ? 'border-transparent bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] text-white'
                                          : `bg-zinc-50/90 text-zinc-800 ${MISSION_STEP2_UPLOAD_HOVER}`
                                      }`}
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={1.7}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className={`relative z-10 h-4 w-4 shrink-0 transition-colors duration-200 ease-out ${
                                          uploadSlot === 'overlay' || headerImageReady
                                            ? 'text-white'
                                            : 'text-zinc-500 group-hover:text-white'
                                        }`}
                                        aria-hidden
                                      >
                                        <path d="M12 2 9.8 7.2 4.5 9.5l5.3 2.3L12 17l2.2-5.2 5.3-2.3-5.3-2.3L12 2Z" />
                                      </svg>
                                      <span
                                        className={`relative z-10 transition-colors duration-200 ease-out ${
                                          uploadSlot === 'overlay' || headerImageReady ? 'text-white' : 'group-hover:text-white'
                                        }`}
                                      >
                                        Header image
                                      </span>
                                      {uploadSlot === 'overlay' ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="absolute right-3 h-4 w-4 shrink-0 animate-spin text-white"
                                          aria-hidden
                                        >
                                          <path d="M21 12a9 9 0 1 1-3.2-6.9" />
                                        </svg>
                                      ) : headerImageReady ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="absolute right-3 h-4 w-4 shrink-0 text-white"
                                          aria-hidden
                                        >
                                          <path d="m5 12 5 5L20 7" />
                                        </svg>
                                      ) : null}
                                    </button>
                                    {headerImageReady && uploadSlot !== 'overlay' ? (
                                      <button
                                        type="button"
                                        onClick={() => void removeHeaderMissionImage()}
                                        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm transition-colors hover:bg-red-50"
                                        aria-label="Remove header image"
                                      >
                                        <RemoveImageIcon className="h-3 w-3" />
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex w-full max-w-[760px] flex-wrap items-center justify-center gap-3 pb-1">
                                  {MISSION_CARD_BACKGROUNDS.map((bg, i) => {
                                    const selected = form.card_theme_index === i
                                    return (
                                      <button
                                        key={i}
                                        type="button"
                                        aria-label={MISSION_CARD_THEME_LABELS[i]}
                                        onClick={() => {
                                          setStep2GradientOverride(null)
                                          setMissionGradStops(tripleStopsFromGradientCss(bg))
                                          setForm((s) => ({ ...s, card_theme_index: i }))
                                        }}
                                        className={`h-10 w-10 cursor-pointer rounded-full transition-[transform,box-shadow,filter] duration-200 ease-out hover:scale-[1.05] hover:brightness-105 ${
                                          selected
                                            ? 'scale-[1.02] ring-2 ring-zinc-900/50 ring-offset-2'
                                            : 'ring-1 ring-zinc-200/90'
                                        }`}
                                        style={{ background: bg }}
                                      />
                                    )
                                  })}
                                  <button
                                    type="button"
                                    onClick={() => setStep2View('customize')}
                                    className={`group ${MISSION_STEP2_SECONDARY_BTN} text-zinc-600 ${MISSION_BUILDER_GRADIENT_HOVER}`}
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={1.8}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4 shrink-0 self-center text-zinc-500 transition-colors duration-200 ease-out group-hover:text-white"
                                      aria-hidden
                                    >
                                      <path d="M12 2 9.8 7.2 4.5 9.5l5.3 2.3L12 17l2.2-5.2 5.3-2.3-5.3-2.3L12 2Z" />
                                    </svg>
                                    Customize
                                  </button>
                                </div>
                              </div>
                            </div>
                        </div>

                        <div
                          className={`absolute inset-0 flex min-h-0 flex-col overflow-hidden transition-all duration-200 ease-out ${
                            step2View === 'customize'
                              ? 'z-10 translate-x-0 opacity-100'
                              : 'pointer-events-none z-0 translate-x-2 opacity-0'
                          }`}
                        >
                          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible px-1 pb-2 pt-1">
                              <div className="flex flex-col items-center space-y-5">
                                <div className="relative w-full max-w-lg">
                                  <button
                                    type="button"
                                    onClick={() => setStep2View('main')}
                                    className="absolute left-0 top-0.5 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-sm transition-transform duration-200 ease-out hover:scale-105 active:scale-95"
                                    aria-label="Back to design"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4"
                                      aria-hidden
                                    >
                                      <path d="M19 12H5M12 19l-7-7 7-7" />
                                    </svg>
                                  </button>
                                  <h4 className="px-11 text-center text-2xl font-semibold tracking-tight text-zinc-900">
                                    Mission color palette
                                  </h4>
                                  <p className="mt-2 text-center text-[13px] font-medium text-zinc-500">
                                    Mission color themes are separate from table team themes.
                                  </p>
                                </div>
                                <div className="relative flex w-full max-w-[760px] flex-wrap justify-center gap-4">
                                  {MISSION_CARD_BACKGROUNDS.map((bg, i) => {
                                    const selected = form.card_theme_index === i
                                    return (
                                      <button
                                        key={i}
                                        type="button"
                                        aria-label={MISSION_CARD_THEME_LABELS[i]}
                                        onClick={() => {
                                          setStep2GradientOverride(null)
                                          setMissionGradStops(tripleStopsFromGradientCss(bg))
                                          setForm((s) => ({ ...s, card_theme_index: i }))
                                        }}
                                        className={`flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-end rounded-2xl p-1.5 text-[10px] font-semibold text-white/95 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] transition-[transform,box-shadow] duration-200 ease-out ${
                                          selected
                                            ? 'scale-[1.03] ring-2 ring-zinc-900 ring-offset-2'
                                            : 'ring-1 ring-zinc-200/90 hover:scale-[1.04] hover:brightness-105'
                                        }`}
                                        style={{ background: bg }}
                                      >
                                        <span className="line-clamp-2 text-center leading-tight drop-shadow-sm">
                                          {MISSION_CARD_THEME_LABELS[i]}
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                                <div className="relative w-full max-w-lg space-y-3 rounded-2xl border border-zinc-100/90 bg-zinc-50/50 p-3">
                                  <p className="text-center text-xs font-semibold text-zinc-600">Card gradient stops</p>
                                  <div className="flex flex-wrap items-center justify-center gap-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-zinc-600">Top</span>
                                      <button
                                        type="button"
                                        data-mission-color-dot="true"
                                        onClick={(e) => openMissionColorPicker('gradTop', e.currentTarget)}
                                        className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                        style={{ backgroundColor: missionGradStops.top }}
                                        aria-label="Gradient top color"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-zinc-600">Middle</span>
                                      <button
                                        type="button"
                                        data-mission-color-dot="true"
                                        onClick={(e) => openMissionColorPicker('gradMid', e.currentTarget)}
                                        className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                        style={{ backgroundColor: missionGradStops.mid }}
                                        aria-label="Gradient middle color"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-zinc-600">Bottom</span>
                                      <button
                                        type="button"
                                        data-mission-color-dot="true"
                                        onClick={(e) => openMissionColorPicker('gradBottom', e.currentTarget)}
                                        className="h-9 w-9 rounded-full border border-white/80 shadow-sm ring-1 ring-zinc-200/80"
                                        style={{ backgroundColor: missionGradStops.bottom }}
                                        aria-label="Gradient bottom color"
                                      />
                                    </div>
                                  </div>
                                  <AdminBuilderColorPickerPortal
                                    open={Boolean(openMissionColorKey && missionColorPopoverPos)}
                                    position={missionColorPopoverPos}
                                    pickerRef={missionColorPickerRef}
                                    svPanelRef={missionSvPanelRef}
                                    pickerHsv={pickerHsv}
                                    pickerHex={pickerHex}
                                    onHueChange={(h) =>
                                      updateMissionPickerColor({
                                        h,
                                        s: pickerHsv.s,
                                        v: pickerHsv.v,
                                      })
                                    }
                                    onSvPanelMouseDown={(e) => {
                                      e.preventDefault()
                                      draggingMissionSvRef.current = true
                                      updateMissionSvFromPointer(e.clientX, e.clientY)
                                    }}
                                    onHexInputChange={(raw) => {
                                      setPickerHex(raw)
                                      const normalized = normalizeHex(raw)
                                      if (!normalized || !openMissionColorKey) return
                                      setPickerHsv(hexToHsv(normalized))
                                      setMissionGradStops((prev) => {
                                        const n = { ...prev }
                                        if (openMissionColorKey === 'gradTop') n.top = normalized
                                        else if (openMissionColorKey === 'gradMid') n.mid = normalized
                                        else n.bottom = normalized
                                        queueMicrotask(() => {
                                          setStep2GradientOverride(missionGradientCssFromTriple(n.top, n.mid, n.bottom))
                                          setForm((s) => ({ ...s, card_theme_index: nearestMissionThemeIndexFromHex(n.top) }))
                                        })
                                        return n
                                      })
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                        </div>
                        </div>

                        <div className="relative z-10 mt-auto shrink-0 border-t border-zinc-100/80 bg-white pt-2">
                          <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                            Live preview
                          </p>
                          <div className="mx-auto flex w-full justify-center px-1 pb-0">
                            <div className="h-[min(300px,38vh)] min-h-[220px] w-full max-w-[480px]">
                              <MissionOverlaySplitPreviews builderFlush form={missionStep2PreviewInput} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === 3 ? (
                      <div className="space-y-4 px-1 pb-8">
                        <h4 className="text-sm font-semibold text-zinc-900">Step 3 · Rewards & submission</h4>
                        <label className="block text-xs">
                          <span className="font-medium text-zinc-600">BeatCoin reward (points)</span>
                          <input
                            type="number"
                            min={0}
                            value={form.points}
                            onChange={(e) => setForm((s) => ({ ...s, points: e.target.value }))}
                            className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px]"
                          />
                        </label>
                        <p className="text-xs text-zinc-500">Shown on cards and in the mission overlay.</p>
                        <label className="block text-xs">
                          <span className="font-medium text-zinc-600">Submission type</span>
                          <select
                            value={form.validation_type}
                            onChange={(e) =>
                              setForm((s) => ({ ...s, validation_type: e.target.value as ValidationType }))
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px]"
                          >
                            {VALIDATION_TYPES.map((v) => (
                              <option key={v} value={v}>
                                {adminValidationTypeLabel(v)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs">
                          <span className="font-medium text-zinc-600">Review mode</span>
                          <select
                            value={form.approval_mode}
                            onChange={(e) =>
                              setForm((s) => ({ ...s, approval_mode: e.target.value as 'auto' | 'manual' }))
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px]"
                          >
                            <option value="auto">Automatic completion</option>
                            <option value="manual">Manual review</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-700">
                          <input
                            type="checkbox"
                            checked={form.message_required}
                            onChange={(e) => setForm((s) => ({ ...s, message_required: e.target.checked }))}
                          />
                          Require message with submission
                        </label>
                        <label className="block text-xs">
                          <span className="font-medium text-zinc-600">Submission hint</span>
                          <input
                            value={form.submission_hint}
                            onChange={(e) => setForm((s) => ({ ...s, submission_hint: e.target.value }))}
                            className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px]"
                            placeholder="e.g. Keep the whole table in frame"
                          />
                        </label>
                      </div>
                    ) : null}

                    {step === 4 ? (
                      <div className="space-y-4 px-1 pb-8">
                        <h4 className="text-sm font-semibold text-zinc-900">Step 4 · Publish</h4>
                        <div className="rounded-xl border border-zinc-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-zinc-900">Mission active</p>
                              <p className="text-xs text-zinc-500">Controls visibility in live mission feed.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setForm((s) => ({ ...s, is_active: !s.is_active }))}
                              className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${
                                form.is_active ? 'bg-zinc-900' : 'bg-zinc-300'
                              }`}
                              aria-label="Toggle active"
                            >
                              <span
                                className={`h-5 w-5 rounded-full bg-white transition-transform ${
                                  form.is_active ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 p-3 text-xs text-zinc-600">
                          <p>
                            <strong>Preview:</strong> {form.title || 'Untitled mission'}
                          </p>
                          <p className="mt-1">
                            {adminValidationTypeLabel(form.validation_type)} · {form.points || 0} points ·{' '}
                            {form.approval_mode === 'manual' ? 'Manual review' : 'Auto approve'}
                          </p>
                        </div>
                      </div>
                    ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                </div>

                        <div className="absolute bottom-6 right-6 z-20 flex flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 2 && step2View === 'customize') {
                        setStep2View('main')
                        return
                      }
                      if (step === 1) setEditorOpen(false)
                      else setStep((s) => Math.max(1, s - 1) as MissionStep)
                    }}
                            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                            Back
                  </button>
                          {step === 1 ? (
                    <button
                      type="button"
                              onClick={advanceFromStep1}
                              className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
                    >
                      Next
                    </button>
                          ) : step === 2 && step2View === 'customize' ? null : step < 4 ? (
                            <button
                              type="button"
                              onClick={() => setStep((s) => Math.min(4, s + 1) as MissionStep)}
                              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
                            >
                              Next
                            </button>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onSaveMission()}
                      className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : editorMode === 'create' ? 'Publish mission' : 'Save mission'}
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center">
          <div
            className={`inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm animate-[fadeIn_180ms_ease-out] ${
              toast.kind === 'success' ? 'border-emerald-200 text-emerald-700' : 'border-rose-200 text-rose-700'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden
            >
              {toast.kind === 'success' ? <path d="m5 12 5 5L20 7" /> : <path d="M12 8v5m0 3h.01" />}
            </svg>
            <span>{toast.message}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
