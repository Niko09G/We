'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  APPROVAL_MODES,
  VALIDATION_TYPES,
  adminValidationTypeLabel,
  createMission,
  getMissionById,
  maxSubmissionsDisplayValue,
  updateMission,
  type MissionRecord,
  type ValidationType,
} from '@/lib/admin-missions'
import {
  listActiveMissionAssignmentsForAdmin,
  setMissionAssignmentsForMission,
} from '@/lib/admin-mission-assignments'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import {
  removeMissionImageAssetByPublicUrl,
  uploadMissionCardCoverAsset,
  uploadMissionImageAsset,
} from '@/lib/mission-image-assets'
import { MAX_IMAGE_UPLOAD_BYTES, prettyMb } from '@/lib/upload-constraints'
import {
  MISSION_CARD_BACKGROUNDS,
  MISSION_CARD_THEME_LABELS,
} from '@/lib/guest-missions-gradients'
import MissionLivePreview, { type MissionPreviewInput } from '@/app/admin/missions/_components/MissionLivePreview'
import { missionTypeIcon } from '@/app/admin/missions/_components/mission-admin-shared'

type BuilderSectionId =
  | 'basics'
  | 'rewards'
  | 'visuals'
  | 'rules'
  | 'assignment'
  | 'review'

type MaxMode = 'unlimited' | 'one' | 'cap'

type FormState = {
  title: string
  description: string
  points: string
  validation_type: ValidationType
  approval_mode: 'auto' | 'manual'
  add_to_greetings: boolean
  maxMode: MaxMode
  maxCap: string
  points_per_submission: string
  header_title: string
  header_image_url: string
  card_cover_image_url: string
  card_theme_choice: number | 'auto'
  target_person_name: string
  submission_hint: string
  success_message: string
  card_cta_label: string
  card_completed_label: string
  message_required: boolean
}

const SECTIONS: { id: BuilderSectionId; label: string; hint: string }[] = [
  { id: 'basics', label: 'Basics', hint: 'Title & type' },
  { id: 'rewards', label: 'Rewards', hint: 'Points' },
  { id: 'visuals', label: 'Visuals', hint: 'Card & overlay' },
  { id: 'rules', label: 'Submission rules', hint: 'Review & limits' },
  { id: 'assignment', label: 'Assignment', hint: 'Tables' },
  { id: 'review', label: 'Review', hint: 'Summary' },
]

function recordToForm(m: MissionRecord): FormState {
  let maxMode: MaxMode = 'unlimited'
  let maxCap = ''
  const v = m.max_submissions_per_table
  if (v === 1) maxMode = 'one'
  else if (v != null && v > 1) {
    maxMode = 'cap'
    maxCap = String(v)
  }

  return {
    title: m.title,
    description: m.description ?? '',
    points: String(m.points ?? 0),
    validation_type: VALIDATION_TYPES.includes(m.validation_type as ValidationType)
      ? (m.validation_type as ValidationType)
      : 'photo',
    approval_mode: APPROVAL_MODES.includes(m.approval_mode as 'auto' | 'manual')
      ? (m.approval_mode as 'auto' | 'manual')
      : 'auto',
    add_to_greetings: m.add_to_greetings ?? false,
    maxMode,
    maxCap,
    points_per_submission:
      m.points_per_submission == null ? '' : String(m.points_per_submission),
    header_title: m.header_title ?? '',
    header_image_url: m.header_image_url ?? '',
    card_cover_image_url: m.card_cover_image_url ?? '',
    card_theme_choice:
      m.card_theme_index != null &&
      m.card_theme_index >= 0 &&
      m.card_theme_index < MISSION_CARD_BACKGROUNDS.length
        ? m.card_theme_index
        : 'auto',
    target_person_name: m.target_person_name ?? '',
    submission_hint: m.submission_hint ?? '',
    success_message: m.success_message ?? '',
    card_cta_label: m.card_cta_label ?? '',
    card_completed_label: m.card_completed_label ?? '',
    message_required: m.message_required ?? false,
  }
}

function emptyForm(): FormState {
  return {
    title: '',
    description: '',
    points: '10',
    validation_type: 'photo',
    approval_mode: 'auto',
    add_to_greetings: false,
    maxMode: 'unlimited',
    maxCap: '10',
    points_per_submission: '',
    header_title: '',
    header_image_url: '',
    card_cover_image_url: '',
    card_theme_choice: 'auto',
    target_person_name: '',
    submission_hint: '',
    success_message: '',
    card_cta_label: '',
    card_completed_label: '',
    message_required: false,
  }
}

function maxSubmissionsPayload(f: FormState): string {
  if (f.maxMode === 'unlimited') return ''
  if (f.maxMode === 'one') return '1'
  return f.maxCap.trim()
}

function submissionRulesSummary(f: FormState): string[] {
  const lines: string[] = []
  lines.push(
    f.approval_mode === 'manual'
      ? 'Needs review before points land.'
      : 'No review — points when submitted.'
  )
  if (f.maxMode === 'unlimited') lines.push('Unlimited submissions per table.')
  else if (f.maxMode === 'one') lines.push('One submission per table.')
  else lines.push(`Up to ${f.maxCap.trim() || '…'} submissions per table.`)
  if (f.message_required) lines.push('Guests must add a message.')
  else lines.push('Message optional.')
  return lines
}

export function MissionBuilder({ missionId }: { missionId: string | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(!!missionId)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [bannerOk, setBannerOk] = useState<string | null>(null)
  const [section, setSection] = useState<BuilderSectionId>('basics')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [savedActive, setSavedActive] = useState<boolean | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(missionId)
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null)

  const [tables, setTables] = useState<AdminTableRow[]>([])
  const [assignmentsByMission, setAssignmentsByMission] = useState<Record<string, string[]>>({})
  const [tableSearch, setTableSearch] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)

  const [uploadSlot, setUploadSlot] = useState<'card' | 'overlay' | null>(null)

  const activeTables = useMemo(
    () =>
      tables.filter(
        (t) => (t.is_active ?? true) === true && (t.is_archived ?? false) === false
      ),
    [tables]
  )
  const activeTableIds = useMemo(() => activeTables.map((t) => t.id), [activeTables])

  const selectedTableIds = useMemo(() => {
    if (!workingId) return new Set<string>()
    return new Set(assignmentsByMission[workingId] ?? [])
  }, [assignmentsByMission, workingId])

  const refreshAssignmentsAndTables = useCallback(async () => {
    const [tList, aMap] = await Promise.all([
      listTablesForAdmin(),
      listActiveMissionAssignmentsForAdmin(),
    ])
    setTables(tList)
    setAssignmentsByMission(aMap)
  }, [])

  const loadMission = useCallback(async () => {
    if (!missionId) {
      setLoadError(null)
      setLoading(false)
      setForm(emptyForm())
      setSavedActive(null)
      setWorkingId(null)
      try {
        await refreshAssignmentsAndTables()
      } catch (e) {
        // Do not set loadError — that would replace the whole builder. Tables/assignments are only
        // needed for the Assignment section; Basics–Review should still work for a new mission.
        setBannerError(
          e instanceof Error ? e.message : 'Failed to load tables or assignments.'
        )
      }
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const m = await getMissionById(missionId)
      if (!m) {
        setLoadError('Mission not found.')
        setLoading(false)
        return
      }
      setForm(recordToForm(m))
      setSavedActive(m.is_active)
      setWorkingId(m.id)
      await refreshAssignmentsAndTables()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [missionId, refreshAssignmentsAndTables])

  useEffect(() => {
    void loadMission()
  }, [loadMission])

  async function persistMission(isPublish: boolean) {
    if (!form.title.trim()) {
      setBannerError('Add a mission title first.')
      return
    }
    setBannerError(null)
    setBannerOk(null)
    setSaving(isPublish ? 'publish' : 'draft')
    try {
      const maxRaw = maxSubmissionsPayload(form)
      const pts = Number(form.points) || 0
      const pps =
        form.points_per_submission.trim() === ''
          ? null
          : Math.max(0, Math.floor(Number(form.points_per_submission) || 0))
      const card_theme_index = form.card_theme_choice === 'auto' ? null : form.card_theme_choice
      const payload = {
        title: form.title,
        description: form.description,
        points: pts,
        validation_type: form.validation_type,
        approval_mode: form.approval_mode,
        is_active: isPublish,
        add_to_greetings: form.add_to_greetings,
        max_submissions_per_table: maxRaw,
        points_per_submission: pps,
        header_title: form.header_title.trim() || null,
        header_image_url: form.header_image_url.trim() || null,
        target_person_name: form.target_person_name.trim() || null,
        submission_hint: form.submission_hint.trim() || null,
        success_message: form.success_message.trim() || null,
        card_cta_label: form.card_cta_label.trim() || null,
        card_completed_label: form.card_completed_label.trim() || null,
        message_required: form.message_required,
        card_theme_index,
        card_cover_image_url: form.card_cover_image_url.trim() || null,
      }

      let id = workingId
      if (!id) {
        id = await createMission(payload)
        setWorkingId(id)
        setSavedActive(isPublish)
        setBannerOk(isPublish ? 'Mission published.' : 'Draft saved.')
        router.replace(`/admin/missions/${id}/edit`)
      } else {
        await updateMission(id, payload)
        setSavedActive(isPublish)
        setBannerOk(isPublish ? 'Mission published.' : 'Draft saved.')
      }
      await refreshAssignmentsAndTables()
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(null)
    }
  }

  async function uploadCardCover(file: File) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setBannerError(`Image is too large. Max ${prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.`)
      return
    }
    setUploadSlot('card')
    setBannerError(null)
    try {
      const prev = form.card_cover_image_url.trim() || null
      const url = await uploadMissionCardCoverAsset(file)
      await removeMissionImageAssetByPublicUrl(prev)
      setForm((s) => ({ ...s, card_cover_image_url: url }))
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploadSlot(null)
    }
  }

  async function uploadOverlay(file: File) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setBannerError(`Image is too large. Max ${prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.`)
      return
    }
    setUploadSlot('overlay')
    setBannerError(null)
    try {
      const prev = form.header_image_url.trim() || null
      const url = await uploadMissionImageAsset(file)
      await removeMissionImageAssetByPublicUrl(prev)
      setForm((s) => ({ ...s, header_image_url: url }))
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploadSlot(null)
    }
  }

  async function setTableAssigned(tableId: string, checked: boolean) {
    if (!workingId) return
    setAssignBusy(true)
    setBannerError(null)
    try {
      const prev = assignmentsByMission[workingId] ?? []
      const next = checked
        ? Array.from(new Set([...prev, tableId]))
        : prev.filter((id) => id !== tableId)
      await setMissionAssignmentsForMission({
        missionId: workingId,
        desiredTableIds: next,
        activeTableIds,
      })
      setAssignmentsByMission((m) => ({ ...m, [workingId]: next }))
      setBannerOk('Assignments updated.')
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Assignment failed.')
    } finally {
      setAssignBusy(false)
    }
  }

  async function assignAllTables() {
    if (!workingId) return
    setAssignBusy(true)
    setBannerError(null)
    try {
      await setMissionAssignmentsForMission({
        missionId: workingId,
        desiredTableIds: [...activeTableIds],
        activeTableIds,
      })
      setAssignmentsByMission((m) => ({
        ...m,
        [workingId]: [...activeTableIds],
      }))
      setBannerOk('Assigned to all tables.')
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Assignment failed.')
    } finally {
      setAssignBusy(false)
    }
  }

  async function clearAllAssignments() {
    if (!workingId) return
    setAssignBusy(true)
    setBannerError(null)
    try {
      await setMissionAssignmentsForMission({
        missionId: workingId,
        desiredTableIds: [],
        activeTableIds,
      })
      setAssignmentsByMission((m) => ({ ...m, [workingId]: [] }))
      setBannerOk('Assignments cleared.')
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Assignment failed.')
    } finally {
      setAssignBusy(false)
    }
  }

  const missionForMaxMeta = useMemo((): MissionRecord | null => {
    if (!workingId) return null
    const capNum = Math.floor(Number(form.maxCap) || 2)
    return {
      id: workingId,
      title: form.title,
      description: form.description || null,
      points: Number(form.points) || 0,
      created_at: '',
      validation_type: form.validation_type,
      approval_mode: form.approval_mode,
      is_active: savedActive ?? false,
      add_to_greetings: form.add_to_greetings,
      allow_multiple_submissions: false,
      max_submissions_per_table:
        form.maxMode === 'unlimited'
          ? null
          : form.maxMode === 'one'
            ? 1
            : Math.max(2, capNum),
      points_per_submission:
        form.points_per_submission === '' ? null : Number(form.points_per_submission),
      target_person_name: form.target_person_name || null,
      submission_hint: form.submission_hint || null,
      success_message: form.success_message || null,
      card_cta_label: form.card_cta_label || null,
      card_completed_label: form.card_completed_label || null,
      header_title: form.header_title || null,
      header_image_url: form.header_image_url || null,
      message_required: form.message_required,
      card_theme_index: form.card_theme_choice === 'auto' ? null : form.card_theme_choice,
      card_cover_image_url: form.card_cover_image_url || null,
    }
  }, [form, savedActive, workingId])

  const previewModel: MissionPreviewInput = useMemo(
    () => ({
      title: form.title,
      points: Number(form.points) || 0,
      validation_type: form.validation_type,
      card_theme_choice: form.card_theme_choice,
      card_cover_image_url: form.card_cover_image_url,
      header_image_url: form.header_image_url,
      card_cta_label: form.card_cta_label,
      card_completed_label: form.card_completed_label,
      cardCompleted: false,
      cardPending: form.approval_mode === 'manual',
    }),
    [form]
  )

  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return activeTables
    return activeTables.filter((t) => t.name.toLowerCase().includes(q))
  }, [activeTables, tableSearch])

  const showMediaRules = form.validation_type !== 'beatcoin'
  const showGreetingOpt =
    form.validation_type === 'photo' ||
    form.validation_type === 'video' ||
    form.validation_type === 'text'
  const typePill = `${adminValidationTypeLabel(form.validation_type)} · ${missionTypeIcon(form.validation_type)}`

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-zinc-950 md:px-6">
        <p className="text-sm text-zinc-500">Loading builder…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-zinc-950 md:px-6">
        <p className="text-sm text-red-600">{loadError}</p>
        <Link
          href="/admin/missions"
          className="mt-4 inline-block text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          Back to missions
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-28 dark:bg-zinc-950 md:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 xl:flex-row">
        <aside className="sticky top-6 hidden h-fit w-52 shrink-0 lg:block">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Mission</p>
          <h1 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {missionId ? 'Edit mission' : 'New mission'}
          </h1>
          <nav className="mt-6 space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition ${
                  section === s.id
                    ? 'bg-white font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700'
                    : 'text-zinc-500 hover:bg-zinc-100/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
                }`}
              >
                {s.label}
                <span className="text-[11px] font-normal text-zinc-400">{s.hint}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <header className="lg:hidden">
            <Link
              href="/admin/missions"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              ← Missions
            </Link>
            <h1 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {missionId ? 'Edit mission' : 'New mission'}
            </h1>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    section === s.id
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </header>

          <header className="hidden items-start justify-between gap-4 lg:flex">
            <div>
              <Link
                href="/admin/missions"
                className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                ← Mission library
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    savedActive
                      ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                      : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {savedActive ? 'Live' : workingId ? 'Draft' : 'Not saved'}
                </span>
                <span className="text-xs text-zinc-500">{typePill}</span>
              </div>
            </div>
          </header>

          {bannerError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {bannerError}
            </p>
          ) : null}
          {bannerOk ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              {bannerOk}
            </p>
          ) : null}

          {section === 'basics' ? (
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Basics</h2>
              <p className="mt-1 text-xs text-zinc-500">What guests see first.</p>
              <div className="mt-4 space-y-4">
                <label className="block text-xs">
                  <span className="font-medium text-zinc-600 dark:text-zinc-400">Title</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    placeholder="e.g. Best group pose"
                  />
                </label>
                <label className="block text-xs">
                  <span className="font-medium text-zinc-600 dark:text-zinc-400">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    placeholder="Short instructions for guests"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">Mission type</span>
                    <select
                      value={form.validation_type}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          validation_type: e.target.value as ValidationType,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {VALIDATION_TYPES.map((v) => (
                        <option key={v} value={v}>
                          {adminValidationTypeLabel(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {form.validation_type === 'beatcoin' ? (
                    <p className="text-xs text-zinc-500 sm:col-span-1 sm:self-end">
                      BeatCoin missions use the token flow — media upload rules are hidden.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {section === 'rewards' ? (
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Rewards</h2>
              <p className="mt-1 text-xs text-zinc-500">Points and bonuses.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="font-medium text-zinc-600 dark:text-zinc-400">Reward (points)</span>
                  <input
                    type="number"
                    min={0}
                    value={form.points}
                    onChange={(e) => setForm((s) => ({ ...s, points: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
                {form.validation_type !== 'beatcoin' ? (
                  <label className="block text-xs">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">
                      Points per extra submission
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={form.points_per_submission}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, points_per_submission: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      placeholder="Empty if not repeatable"
                    />
                  </label>
                ) : null}
              </div>
              {showGreetingOpt ? (
                <label className="mt-4 flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={form.add_to_greetings}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, add_to_greetings: e.target.checked }))
                    }
                  />
                  Also surface in greetings / social context when relevant
                </label>
              ) : null}
            </section>
          ) : null}

          {section === 'visuals' ? (
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Visuals</h2>
              <p className="mt-1 text-xs text-zinc-500">Card and overlay are separate assets.</p>

              <div className="mt-6 space-y-6">
                <div>
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Card</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">Theme + optional full-bleed artwork.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((s) => ({ ...s, card_theme_choice: 'auto' }))}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                        form.card_theme_choice === 'auto'
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
                      }`}
                    >
                      Auto palette
                    </button>
                    {MISSION_CARD_THEME_LABELS.map((label, i) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setForm((s) => ({ ...s, card_theme_choice: i }))}
                        className={`relative h-11 w-11 overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 ${
                          form.card_theme_choice === i
                            ? 'ring-zinc-900 dark:ring-zinc-100'
                            : 'ring-transparent'
                        }`}
                        style={{ background: MISSION_CARD_BACKGROUNDS[i] }}
                        title={label}
                        aria-label={label}
                      />
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Card artwork (optional)
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {form.card_cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={form.card_cover_image_url}
                          alt=""
                          className="h-14 w-24 rounded-lg object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
                        />
                      ) : (
                        <div className="flex h-14 w-24 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-600">
                          No image
                        </div>
                      )}
                      <label className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-950">
                        {uploadSlot === 'card' ? 'Uploading…' : 'Upload'}
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/webp"
                          className="sr-only"
                          disabled={uploadSlot === 'card'}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            e.currentTarget.value = ''
                            if (f) void uploadCardCover(f)
                          }}
                        />
                      </label>
                      {form.card_cover_image_url ? (
                        <button
                          type="button"
                          className="text-xs text-zinc-500 underline"
                          onClick={async () => {
                            const prev = form.card_cover_image_url.trim() || null
                            setForm((s) => ({ ...s, card_cover_image_url: '' }))
                            await removeMissionImageAssetByPublicUrl(prev)
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-zinc-500">
                    Type icon:{' '}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {missionTypeIcon(form.validation_type)}{' '}
                      {adminValidationTypeLabel(form.validation_type)}
                    </span>
                  </p>

                  <div className="mt-5 space-y-4 border-t border-zinc-100 pt-5 dark:border-zinc-800">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Card CTA label
                      <input
                        type="text"
                        value={form.card_cta_label}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, card_cta_label: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        placeholder="Start mission"
                        autoComplete="off"
                      />
                      <span className="mt-1 block font-normal text-[11px] text-zinc-500">
                        Optional. Button label before the mission is completed (default: Start
                        mission). Examples: Snap photo, Say hi, Join now.
                      </span>
                    </label>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Card completed label
                      <input
                        type="text"
                        value={form.card_completed_label}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, card_completed_label: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        placeholder="Completed"
                        autoComplete="off"
                      />
                      <span className="mt-1 block font-normal text-[11px] text-zinc-500">
                        Optional. Button label after the mission is completed (default: Completed).
                        Examples: Locked in, Done, Confirmed.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-zinc-100 pt-6 dark:border-zinc-800">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Overlay</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Round image in the mission overlay header.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {form.header_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.header_image_url}
                        alt=""
                        className="h-14 w-14 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-600">
                        —
                      </div>
                    )}
                    <label className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-950">
                      {uploadSlot === 'overlay' ? 'Uploading…' : 'Upload overlay image'}
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        className="sr-only"
                        disabled={uploadSlot === 'overlay'}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.currentTarget.value = ''
                          if (f) void uploadOverlay(f)
                        }}
                      />
                    </label>
                    {form.header_image_url ? (
                      <button
                        type="button"
                        className="text-xs text-zinc-500 underline"
                        onClick={async () => {
                          const prev = form.header_image_url.trim() || null
                          setForm((s) => ({ ...s, header_image_url: '' }))
                          await removeMissionImageAssetByPublicUrl(prev)
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-4 block text-xs">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">
                      Overlay title override (optional)
                    </span>
                    <input
                      value={form.header_title}
                      onChange={(e) => setForm((s) => ({ ...s, header_title: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      placeholder="Defaults to mission title"
                    />
                  </label>
                </div>
              </div>
            </section>
          ) : null}

          {section === 'rules' ? (
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Submission rules
              </h2>
              <p className="mt-1 text-xs text-zinc-500">Human-readable limits and review.</p>

              <div className="mt-4 space-y-4">
                <fieldset>
                  <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Needs review?
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="approval"
                        checked={form.approval_mode === 'auto'}
                        onChange={() => setForm((s) => ({ ...s, approval_mode: 'auto' }))}
                      />
                      No — approve automatically
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="approval"
                        checked={form.approval_mode === 'manual'}
                        onChange={() => setForm((s) => ({ ...s, approval_mode: 'manual' }))}
                      />
                      Yes — pending until you approve
                    </label>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Submissions per table
                  </legend>
                  <div className="mt-2 flex flex-col gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="max"
                        checked={form.maxMode === 'unlimited'}
                        onChange={() => setForm((s) => ({ ...s, maxMode: 'unlimited' }))}
                      />
                      Unlimited submissions
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="max"
                        checked={form.maxMode === 'one'}
                        onChange={() => setForm((s) => ({ ...s, maxMode: 'one' }))}
                      />
                      One submission per table
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="max"
                        checked={form.maxMode === 'cap'}
                        onChange={() => setForm((s) => ({ ...s, maxMode: 'cap' }))}
                      />
                      Up to{' '}
                      <input
                        type="number"
                        min={2}
                        value={form.maxCap}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, maxCap: e.target.value, maxMode: 'cap' }))
                        }
                        className="w-16 rounded border border-zinc-200 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
                      />{' '}
                      per table
                    </label>
                  </div>
                </fieldset>

                {showMediaRules ? (
                  <>
                    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={form.message_required}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, message_required: e.target.checked }))
                        }
                      />
                      Require a written message with the submission
                    </label>
                    <label className="block text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        Hint for guests (placeholder / guidance)
                      </span>
                      <input
                        value={form.submission_hint}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, submission_hint: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        placeholder="e.g. Hold the toast in frame"
                      />
                    </label>
                    {form.validation_type === 'text' ? (
                      <label className="block text-xs">
                        <span className="font-medium text-zinc-600 dark:text-zinc-400">
                          Named person (text missions)
                        </span>
                        <input
                          value={form.target_person_name}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, target_person_name: e.target.value }))
                          }
                          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="Who should guests mention?"
                        />
                      </label>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Token missions use your BeatCoin settings — no photo/text rules here.
                  </p>
                )}

                <label className="mt-5 block text-xs">
                  <span className="font-medium text-zinc-600 dark:text-zinc-400">
                    Success message
                  </span>
                  <textarea
                    value={form.success_message}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, success_message: e.target.value }))
                    }
                    rows={2}
                    placeholder="e.g. Nice one — that'll show on the feed shortly."
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    Optional. Shown after a successful submission in the guest mission overlay.
                  </p>
                </label>
              </div>
            </section>
          ) : null}

          {section === 'assignment' ? (
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Assignment</h2>
              <p className="mt-1 text-xs text-zinc-500">Which tables see this mission.</p>

              {!workingId ? (
                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                  Save the mission as a draft or publish it, then you can assign tables.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search tables…"
                      className="min-w-[12rem] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <button
                      type="button"
                      disabled={assignBusy}
                      onClick={() => void assignAllTables()}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-800/80"
                    >
                      Assign all
                    </button>
                    <button
                      type="button"
                      disabled={assignBusy}
                      onClick={() => void clearAllAssignments()}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      Clear all
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {selectedTableIds.size} of {activeTables.length} tables assigned
                  </p>
                  <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                    {filteredTables.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedTableIds.has(t.id)}
                            disabled={assignBusy}
                            onChange={(e) => void setTableAssigned(t.id, e.target.checked)}
                          />
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-900"
                            style={{ backgroundColor: t.color ?? '#71717a' }}
                            aria-hidden
                          />
                          <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                            {t.name}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : null}

          {section === 'review' ? (
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Review</h2>
              <p className="mt-1 text-xs text-zinc-500">Quick sanity check before you save.</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-zinc-500">Title</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">{form.title.trim() || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500">Type</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">{typePill}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500">Reward</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">{form.points} points</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500">Theme</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {form.card_theme_choice === 'auto'
                      ? 'Auto'
                      : MISSION_CARD_THEME_LABELS[form.card_theme_choice]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500">Rules</dt>
                  <dd>
                    <ul className="list-inside list-disc text-zinc-700 dark:text-zinc-300">
                      {submissionRulesSummary(form).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                {workingId ? (
                  <div>
                    <dt className="text-xs font-medium text-zinc-500">Assigned tables</dt>
                    <dd className="text-zinc-900 dark:text-zinc-100">
                      {selectedTableIds.size} / {activeTables.length}
                    </dd>
                  </div>
                ) : null}
                {missionForMaxMeta ? (
                  <div>
                    <dt className="text-xs font-medium text-zinc-500">Admin · max field</dt>
                    <dd className="font-mono text-xs text-zinc-500">
                      {maxSubmissionsDisplayValue(missionForMaxMeta) || '(empty = unlimited)'}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>

        <aside className="sticky top-6 h-fit w-full shrink-0 xl:w-[280px]">
          <MissionLivePreview form={previewModel} />
        </aside>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/admin/missions')}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!!saving || !form.title.trim()}
            onClick={() => void persistMission(false)}
            className="rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {saving === 'draft' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            disabled={!!saving || !form.title.trim()}
            onClick={() => void persistMission(true)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving === 'publish' ? 'Publishing…' : 'Publish mission'}
          </button>
        </div>
      </div>
    </div>
  )
}
