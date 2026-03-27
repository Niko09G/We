'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import { MISSION_CARD_BACKGROUNDS } from '@/lib/guest-missions-gradients'

type MissionView = 'cards' | 'list'
type MissionStatusFilter = 'all' | 'active' | 'inactive' | 'archived'
type MissionStep = 1 | 2 | 3 | 4

type MissionForm = {
  title: string
  description: string
  header_image_url: string
  points: string
  validation_type: ValidationType
  approval_mode: 'auto' | 'manual'
  message_required: boolean
  submission_hint: string
  is_active: boolean
}

function emptyForm(): MissionForm {
  return {
    title: '',
    description: '',
    header_image_url: '',
    points: '10',
    validation_type: 'photo',
    approval_mode: 'auto',
    message_required: false,
    submission_hint: '',
    is_active: true,
  }
}

function formFromMission(m: MissionRecord): MissionForm {
  return {
    title: m.title ?? '',
    description: m.description ?? '',
    header_image_url: m.header_image_url ?? '',
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
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<MissionForm>(emptyForm)

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
    setForm(emptyForm())
    setEditorOpen(true)
  }

  function openEdit(mission: MissionRecord) {
    setEditorMode('edit')
    setEditingId(mission.id)
    setStep(1)
    setForm(formFromMission(mission))
    setEditorOpen(true)
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
                className="relative z-10 flex h-[88vh] max-h-[860px] min-h-0 w-full max-w-[1060px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">
                      {editorMode === 'create' ? 'New mission' : 'Edit mission'}
                    </h3>
                    <div className="mt-1 inline-flex items-center gap-1.5">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setStep(n as MissionStep)}
                          className={`h-1.5 w-10 rounded-full transition-colors duration-150 ${
                            step >= n ? 'bg-zinc-900' : 'bg-zinc-200'
                          }`}
                          aria-label={`Step ${n}`}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditorOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black text-white"
                    aria-label="Close editor"
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
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex h-full min-h-0 flex-1 overflow-hidden px-5 py-4 pb-24">
                  <div className="mx-auto h-full w-full max-w-[760px] overflow-y-auto">
                    {step === 1 ? (
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-zinc-900">Step 1 · Identity</h4>
                        <label className="block text-xs">
                          <span className="font-medium text-zinc-600">Mission title</span>
                          <input
                            value={form.title}
                            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                            placeholder="e.g. Best group pose"
                            className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px]"
                          />
                        </label>
                        <label className="block text-xs">
                          <span className="font-medium text-zinc-600">Subtitle / description</span>
                          <textarea
                            value={form.description}
                            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[14px]"
                          />
                        </label>
                        <label className="block text-xs">
                          <span className="font-medium text-zinc-600">Mission artwork URL</span>
                          <input
                            value={form.header_image_url}
                            onChange={(e) => setForm((s) => ({ ...s, header_image_url: e.target.value }))}
                            placeholder="https://..."
                            className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px]"
                          />
                        </label>
                      </div>
                    ) : null}

                    {step === 2 ? (
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-zinc-900">Step 2 · Rewards</h4>
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
                        <p className="text-xs text-zinc-500">
                          Reward appears on cards and mission detail.
                        </p>
                      </div>
                    ) : null}

                    {step === 3 ? (
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-zinc-900">Step 3 · Submission</h4>
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
                      <div className="space-y-4">
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

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-zinc-200 bg-white px-5 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 1) setEditorOpen(false)
                      else setStep((s) => Math.max(1, s - 1) as MissionStep)
                    }}
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
                  >
                    {step === 1 ? 'Cancel' : 'Back'}
                  </button>
                  {step < 4 ? (
                    <button
                      type="button"
                      onClick={() => setStep((s) => Math.min(4, s + 1) as MissionStep)}
                      className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white"
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
