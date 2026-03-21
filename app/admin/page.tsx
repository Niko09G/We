'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  createMission,
  listMissions,
  updateMission,
  VALIDATION_TYPES,
  APPROVAL_MODES,
  type MissionRecord,
  type ValidationType,
  type ApprovalMode,
} from '@/lib/admin-missions'
import {
  fetchAdminMissionData,
  deleteCompletion,
  insertCompletion,
  type AdminCompletion,
  type AdminMission,
  type AdminTable,
} from '@/lib/admin-completions'
import { deleteGreeting, listGreetings, type GreetingRow } from '@/lib/greetings-admin'
import {
  approveMissionSubmission,
  listMissionSubmissionsForAdmin,
  restoreMissionSubmission,
  rejectMissionSubmission,
  type MissionSubmissionRow,
} from '@/lib/admin-mission-submissions'
import {
  listActiveMissionAssignmentsForAdmin,
  setMissionAssignmentsForMission,
} from '@/lib/admin-mission-assignments'
import { getMissionsEnabled, setMissionsEnabled as persistMissionsEnabled } from '@/lib/app-settings'
import {
  archiveTable,
  createTable,
  listTablesForAdmin,
  permanentlyDeleteTable,
  restoreTable,
  updateTable,
  type AdminTableRow,
} from '@/lib/admin-tables'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

const TABLE_COLOR_PRESETS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
  '#0f172a',
] as const

function toSixDigitHex(s: string): string {
  const h = s.trim().replace(/^#/, '')
  if (h.length === 6 && /^[0-9a-fA-F]+$/.test(h)) return `#${h}`
  if (h.length === 3 && /^[0-9a-fA-F]+$/.test(h))
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
  return '#94a3b8'
}

function tableColorValueForInput(value: string): string {
  if (!value?.trim()) return '#94a3b8'
  const h = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(h)) return `#${h}`
  if (/^[0-9a-fA-F]{3}$/.test(h))
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
  return '#94a3b8'
}

function TableColorPicker({
  value,
  onChange,
  label = 'Color',
}: {
  value: string
  onChange: (hex: string) => void
  label?: string
}) {
  const current = value?.trim() ? toSixDigitHex(value) : ''
  const colorInputValue = tableColorValueForInput(value)

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <span className="text-xs font-medium text-zinc-500">{label}</span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {TABLE_COLOR_PRESETS.map((hex) => {
            const isSelected =
              current.toLowerCase() === hex.toLowerCase()
            return (
              <button
                key={hex}
                type="button"
                onClick={() => onChange(hex)}
                className={`h-7 w-7 shrink-0 rounded border-2 transition-[border-color,box-shadow] ${
                  isSelected
                    ? 'border-zinc-900 dark:border-zinc-100 ring-2 ring-amber-500/80 ring-offset-1 dark:ring-offset-zinc-900'
                    : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500'
                }`}
                style={{ backgroundColor: hex }}
                title={hex}
                aria-label={`Color ${hex}`}
              />
            )
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={colorInputValue}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-zinc-200 dark:border-zinc-600 bg-transparent p-0"
            title="Custom color"
            aria-label="Custom color"
          />
          {current && (
            <span
              className="h-5 w-5 shrink-0 rounded border border-zinc-200 dark:border-zinc-600"
              style={{ backgroundColor: current }}
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [rows, setRows] = useState<GreetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState<string | null>(null)

  const [mcTables, setMcTables] = useState<AdminTable[]>([])
  const [mcMissions, setMcMissions] = useState<AdminMission[]>([])
  const [mcCompletions, setMcCompletions] = useState<AdminCompletion[]>([])
  const [mcLoading, setMcLoading] = useState(true)
  const [mcError, setMcError] = useState<string | null>(null)
  const [mcSuccess, setMcSuccess] = useState<string | null>(null)
  /** Pair we just recorded — suppress duplicate warning until selection changes. */
  const [mcSuccessPair, setMcSuccessPair] = useState<{
    tableId: string
    missionId: string
  } | null>(null)
  const [mcTableId, setMcTableId] = useState('')
  const [mcMissionId, setMcMissionId] = useState('')
  const [mcSubmitting, setMcSubmitting] = useState(false)

  const [mmSuccess, setMmSuccess] = useState<string | null>(null)
  const [mmError, setMmError] = useState<string | null>(null)
  const [mmCreating, setMmCreating] = useState(false)
  const [mmCreate, setMmCreate] = useState({
    title: '',
    description: '',
    points: '10',
    validation_type: 'photo' as ValidationType,
    approval_mode: 'auto' as ApprovalMode,
    is_active: true,
    add_to_greetings: false,
    allow_multiple_submissions: false,
    points_per_submission: '' as string | number,
    target_person_name: '',
    submission_hint: '',
    header_title: '',
    header_image_url: '',
  })
  const [mmEditingId, setMmEditingId] = useState<string | null>(null)
  const [mmEdit, setMmEdit] = useState({
    title: '',
    description: '',
    points: '0',
    validation_type: 'photo' as ValidationType,
    approval_mode: 'auto' as ApprovalMode,
    is_active: true,
    add_to_greetings: false,
    allow_multiple_submissions: false,
    points_per_submission: '' as string | number,
    target_person_name: '',
    submission_hint: '',
    header_title: '',
    header_image_url: '',
  })
  const [mmSavingId, setMmSavingId] = useState<string | null>(null)
  const [mmMissions, setMmMissions] = useState<MissionRecord[]>([])

  // Mission assignment UI (mission_assignments)
  const [maAssignedTableIdsByMission, setMaAssignedTableIdsByMission] = useState<
    Map<string, Set<string>>
  >(new Map())
  const [maAssignmentsLoading, setMaAssignmentsLoading] = useState(true)
  const [maAssignmentsError, setMaAssignmentsError] = useState<string | null>(null)
  const [maSelectedMissionId, setMaSelectedMissionId] = useState<string>('')
  const [maAssignToAllTables, setMaAssignToAllTables] = useState(false)
  const [maSelectedTableIds, setMaSelectedTableIds] = useState<Set<string>>(
    new Set()
  )
  const [maAssignSaving, setMaAssignSaving] = useState(false)
  const [maAssignSuccess, setMaAssignSuccess] = useState<string | null>(null)
  const [maAssignError, setMaAssignError] = useState<string | null>(null)

  const [msSubmissions, setMsSubmissions] = useState<MissionSubmissionRow[]>([])
  const [msLoading, setMsLoading] = useState(true)
  const [msError, setMsError] = useState<string | null>(null)
  const [msSuccess, setMsSuccess] = useState<string | null>(null)
  const [msProcessingId, setMsProcessingId] = useState<string | null>(null)
  const [msRejectingId, setMsRejectingId] = useState<string | null>(null)
  const [msRejectNote, setMsRejectNote] = useState<string>('')
  const [msSubmissionsView, setMsSubmissionsView] = useState<
    'pending' | 'rejected' | 'all'
  >('pending')

  type MediaPreviewKind = 'image' | 'signature' | 'video'
  const [mediaPreview, setMediaPreview] = useState<{
    kind: MediaPreviewKind
    src: string
  } | null>(null)

  const [ttTables, setTtTables] = useState<AdminTableRow[]>([])
  const [ttLoading, setTtLoading] = useState(true)
  const [ttError, setTtError] = useState<string | null>(null)
  const [ttSuccess, setTtSuccess] = useState<string | null>(null)
  const [ttCreating, setTtCreating] = useState(false)
  const [ttCreate, setTtCreate] = useState({
    name: '',
    color: '',
    is_active: true,
    capacity: '10',
  })
  const [ttEditingId, setTtEditingId] = useState<string | null>(null)
  const [ttEditName, setTtEditName] = useState('')
  const [ttEditColor, setTtEditColor] = useState('')
  const [ttEditCapacity, setTtEditCapacity] = useState('10')
  const [ttSavingId, setTtSavingId] = useState<string | null>(null)
  const [ttArchivingId, setTtArchivingId] = useState<string | null>(null)
  const [ttRestoringId, setTtRestoringId] = useState<string | null>(null)
  const [ttDeletingId, setTtDeletingId] = useState<string | null>(null)

  const [missionsEnabled, setMissionsEnabledState] = useState<boolean | null>(null)
  const [missionsLockSaving, setMissionsLockSaving] = useState(false)
  const [missionsLockError, setMissionsLockError] = useState<string | null>(null)
  const [missionsLockSuccess, setMissionsLockSuccess] = useState<string | null>(
    null
  )

  const refreshMissionsEnabled = useCallback(async () => {
    setMissionsLockError(null)
    try {
      setMissionsEnabledState(await getMissionsEnabled())
    } catch (e) {
      setMissionsLockError(e instanceof Error ? e.message : 'Failed to load mission lock.')
      setMissionsEnabledState(true)
    }
  }, [])

  const refreshTables = useCallback(async () => {
    setTtError(null)
    try {
      setTtTables(await listTablesForAdmin())
    } catch (e) {
      setTtError(e instanceof Error ? e.message : 'Failed to load tables.')
    } finally {
      setTtLoading(false)
    }
  }, [])

  const refreshMissionSubmissions = useCallback(async () => {
    setMsError(null)
    try {
      setMsSubmissions(await listMissionSubmissionsForAdmin(50))
    } catch (e) {
      setMsError(e instanceof Error ? e.message : 'Failed to load submissions.')
    } finally {
      setMsLoading(false)
    }
  }, [])

  const refreshMmList = useCallback(async () => {
    try {
      setMmMissions(await listMissions())
    } catch (e) {
      setMmError(e instanceof Error ? e.message : 'Failed to load missions list.')
    }
  }, [])

  const refreshMissionAssignments = useCallback(async () => {
    setMaAssignmentsError(null)
    setMaAssignSuccess(null)
    setMaAssignError(null)
    setMaAssignmentsLoading(true)
    try {
      const mapping = await listActiveMissionAssignmentsForAdmin()
      const next = new Map<string, Set<string>>()
      Object.entries(mapping).forEach(([missionId, tableIds]) => {
        next.set(missionId, new Set(tableIds))
      })
      setMaAssignedTableIdsByMission(next)
    } catch (e) {
      setMaAssignmentsError(
        e instanceof Error
          ? e.message
          : 'Failed to load mission assignments.'
      )
    } finally {
      setMaAssignmentsLoading(false)
    }
  }, [])

  const refreshMissionData = useCallback(async () => {
    setMcError(null)
    try {
      const data = await fetchAdminMissionData()
      setMcTables(data.tables)
      setMcMissions(data.missions)
      setMcCompletions(data.completions)
    } catch (e) {
      setMcError(e instanceof Error ? e.message : 'Failed to load mission data.')
    } finally {
      setMcLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshTables()
    void refreshMissionsEnabled()
    void refreshMissionData()
    void refreshMmList()
    void refreshMissionAssignments()
    void refreshMissionSubmissions()
  }, [
    refreshTables,
    refreshMissionsEnabled,
    refreshMissionData,
    refreshMmList,
    refreshMissionAssignments,
    refreshMissionSubmissions,
  ])

  const mcAlreadyDone = useMemo(() => {
    if (!mcTableId || !mcMissionId) return false
    return mcCompletions.some(
      (c) => c.table_id === mcTableId && c.mission_id === mcMissionId
    )
  }, [mcTableId, mcMissionId, mcCompletions])

  const tableNameById = useMemo(() => {
    const m = new Map<string, string>()
    mcTables.forEach((t) => m.set(t.id, t.name))
    return m
  }, [mcTables])

  const missionTitleById = useMemo(() => {
    const m = new Map<string, string>()
    mcMissions.forEach((mis) => m.set(mis.id, mis.title))
    return m
  }, [mcMissions])

  const activeTablesForAssignment = useMemo(() => {
    return ttTables.filter((t) => t.is_active && !t.is_archived)
  }, [ttTables])

  const activeTableIdsForAssignment = useMemo(() => {
    return activeTablesForAssignment.map((t) => t.id)
  }, [activeTablesForAssignment])

  useEffect(() => {
    if (maSelectedMissionId) return
    if (mmMissions.length === 0) return
    setMaSelectedMissionId(mmMissions[0].id)
  }, [maSelectedMissionId, mmMissions])

  useEffect(() => {
    if (!maSelectedMissionId) return
    const assigned = maAssignedTableIdsByMission.get(maSelectedMissionId) ?? new Set<string>()
    const assignedSet = new Set(assigned)
    if (
      activeTableIdsForAssignment.length > 0 &&
      assignedSet.size === activeTableIdsForAssignment.length &&
      assignedSet.size > 0
    ) {
      setMaAssignToAllTables(true)
      setMaSelectedTableIds(new Set(activeTableIdsForAssignment))
      return
    }

    setMaAssignToAllTables(false)
    setMaSelectedTableIds(assignedSet)
  }, [
    maAssignedTableIdsByMission,
    maSelectedMissionId,
    activeTableIdsForAssignment,
  ])

  async function handleMarkCompleted() {
    if (!mcTableId || !mcMissionId || mcAlreadyDone || mcSubmitting) return
    setMcSuccess(null)
    setMcSuccessPair(null)
    setMcError(null)
    setMcSubmitting(true)
    try {
      await insertCompletion(mcTableId, mcMissionId)
      setMcSuccessPair({ tableId: mcTableId, missionId: mcMissionId })
      setMcSuccess('Completion recorded.')
      await refreshMissionData()
    } catch (e) {
      setMcError(e instanceof Error ? e.message : 'Failed to record completion.')
    } finally {
      setMcSubmitting(false)
    }
  }

  async function handleResetCompletion() {
    if (!mcTableId || !mcMissionId || mcSubmitting) return
    if (!mcAlreadyDone) return
    const tableName = tableNameById.get(mcTableId) ?? 'this table'
    const missionTitle = missionTitleById.get(mcMissionId) ?? 'this mission'
    const ok = window.confirm(
      `Reset completion for "${tableName}" on "${missionTitle}"?\n\nThis removes completion points for this mission but keeps submission history.`
    )
    if (!ok) return

    setMcSuccess(null)
    setMcSuccessPair(null)
    setMcError(null)
    setMcSubmitting(true)
    try {
      await deleteCompletion(mcTableId, mcMissionId)
      setMcSuccess('Completion reset.')
      await refreshMissionData()
    } catch (e) {
      setMcError(e instanceof Error ? e.message : 'Failed to reset completion.')
    } finally {
      setMcSubmitting(false)
    }
  }

  const mcShowingJustRecorded =
    mcSuccess &&
    mcSuccessPair &&
    mcSuccessPair.tableId === mcTableId &&
    mcSuccessPair.missionId === mcMissionId
  const mcShowDuplicateWarning =
    mcAlreadyDone &&
    !!mcTableId &&
    !!mcMissionId &&
    !mcShowingJustRecorded

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await listGreetings()
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load greetings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const hasGreetings = rows.length > 0
  const headerSubtitle = useMemo(() => {
    if (loading) return 'Loading…'
    if (!hasGreetings) return 'No greetings yet.'
    return `${rows.length} greeting${rows.length === 1 ? '' : 's'}`
  }, [hasGreetings, loading, rows.length])

  async function handleDelete(row: GreetingRow) {
    if (!window.confirm('Are you sure?')) return
    setError(null)
    setSuccessMessage(null)
    setStorageWarning(null)
    setDeletingId(row.id)
    try {
      const result = await deleteGreeting({ id: row.id, image_url: row.image_url })
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setSuccessMessage('Greeting deleted.')
      if (result.storageWarning) setStorageWarning(result.storageWarning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete greeting.')
    } finally {
      setDeletingId(null)
    }
  }

  const pathname = usePathname()
  const mode:
    | 'overview'
    | 'missions'
    | 'tables'
    | 'submissions'
    | 'greetings'
    | 'display' =
    pathname === '/admin'
      ? 'overview'
      : pathname.startsWith('/admin/missions')
        ? 'missions'
        : pathname.startsWith('/admin/tables')
          ? 'tables'
          : pathname.startsWith('/admin/submissions')
            ? 'submissions'
            : pathname.startsWith('/admin/greetings')
              ? 'greetings'
              : pathname.startsWith('/admin/display')
                ? 'display'
                : 'overview'

  if (mode === 'overview') {
    const pendingCount =
      msLoading === true
        ? null
        : msSubmissions.filter((s) => s.status === 'pending').length
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-6 md:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Admin overview
            </h1>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Manage the event from the sidebar.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <a
              href="/admin/missions"
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Missions
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {mmMissions.length} total
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  🧩
                </span>
              </div>
            </a>

            <a
              href="/admin/tables"
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Tables
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {ttTables.filter((t) => !t.is_archived).length} active
                    {ttTables.some((t) => t.is_archived)
                      ? ` · ${ttTables.filter((t) => t.is_archived).length} archived`
                      : ''}
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  🍽️
                </span>
              </div>
            </a>

            <a
              href="/admin/attendees"
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Attendees
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    CSV import, RSVP & seating
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  👥
                </span>
              </div>
            </a>

            <a
              href="/admin/submissions"
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Submissions
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {pendingCount === null
                      ? 'Loading…'
                      : `${pendingCount} pending`}
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  📨
                </span>
              </div>
            </a>

            <a
              href="/admin/greetings"
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Greetings
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {rows.length} total
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  💌
                </span>
              </div>
            </a>

            <a
              href="/admin/display"
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950 md:col-span-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Display Controls
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Coming soon
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  📺
                </span>
              </div>
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'display') {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-6 md:px-6">
        <div className="mx-auto w-full max-w-3xl rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Display controls coming soon
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            For now, use the display page for the leaderboard and recent activity.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-6 md:px-6">
      <div className="mx-auto w-full max-w-5xl">
        {mode === 'tables' && (
          <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Tables
            </h2>
            <button
              type="button"
              onClick={() => void refreshTables()}
              disabled={ttLoading}
              className="rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Create and edit teams/tables. Names must be unique.
          </p>
          {ttError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {ttError}
            </p>
          )}
          {ttSuccess && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">
              {ttSuccess}
            </p>
          )}
          <div className="mt-3 rounded border border-zinc-200 dark:border-zinc-700 p-3">
            <p className="mb-2 text-xs font-medium text-zinc-500">New table</p>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Name</span>
                  <input
                    placeholder="Table name"
                    value={ttCreate.name}
                    onChange={(e) => {
                      setTtCreate((s) => ({ ...s, name: e.target.value }))
                      setTtError(null)
                      setTtSuccess(null)
                    }}
                    className="min-w-[140px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
                  />
                </div>
                <TableColorPicker
                  value={ttCreate.color}
                  onChange={(c) => {
                    setTtCreate((s) => ({ ...s, color: c }))
                    setTtError(null)
                    setTtSuccess(null)
                  }}
                />
                <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={ttCreate.is_active}
                    onChange={(e) =>
                      setTtCreate((s) => ({ ...s, is_active: e.target.checked }))
                    }
                  />
                  Active
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-zinc-500">
                    Seat capacity
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={ttCreate.capacity}
                    onChange={(e) =>
                      setTtCreate((s) => ({ ...s, capacity: e.target.value }))
                    }
                    className="w-20 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                type="button"
                disabled={ttCreating || !ttCreate.name.trim()}
                onClick={async () => {
                  setTtError(null)
                  setTtSuccess(null)
                  setTtCreating(true)
                  try {
                    const cap = Number.parseInt(ttCreate.capacity, 10)
                    await createTable({
                      name: ttCreate.name.trim(),
                      color: ttCreate.color.trim() || null,
                      is_active: ttCreate.is_active,
                      capacity: Number.isFinite(cap) ? cap : 10,
                    })
                    setTtSuccess('Table created.')
                    setTtCreate({ name: '', color: '', is_active: true, capacity: '10' })
                    await refreshTables()
                    await refreshMissionData()
                  } catch (e) {
                    setTtError(e instanceof Error ? e.message : 'Failed to create table.')
                  } finally {
                    setTtCreating(false)
                  }
                }}
                  className="rounded bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
                >
                  {ttCreating ? 'Saving…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
          {ttLoading && (
            <p className="mt-3 text-xs text-zinc-500">Loading tables…</p>
          )}
          {!ttLoading && ttTables.length === 0 && (
            <p className="mt-3 text-xs text-zinc-500">No tables yet. Create one above.</p>
          )}
          {!ttLoading && ttTables.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Active tables
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {ttTables
                  .filter((t) => !t.is_archived)
                  .map((t) => {
                    const isEditing = ttEditingId === t.id
                    return (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-center gap-2 rounded border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 px-2 py-1.5 text-sm"
                      >
                        {t.color ? (
                          <span
                            className="h-4 w-4 shrink-0 rounded border border-zinc-200 dark:border-zinc-600"
                            style={{ backgroundColor: t.color }}
                            aria-hidden
                          />
                        ) : (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                            No color
                          </span>
                        )}
                        {isEditing ? (
                          <>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                              <input
                                value={ttEditName}
                                onChange={(e) => setTtEditName(e.target.value)}
                                className="min-w-[120px] flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
                                placeholder="Name"
                                autoFocus
                              />
                              <div className="flex items-center gap-1.5">
                                <TableColorPicker
                                  value={ttEditColor}
                                  onChange={setTtEditColor}
                                  label=""
                                />
                              </div>
                              <div>
                                <span className="mb-1 block text-[10px] font-medium text-zinc-500">
                                  Seats
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={ttEditCapacity}
                                  onChange={(e) => setTtEditCapacity(e.target.value)}
                                  className="w-20 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={ttSavingId !== null || !ttEditName.trim()}
                              onClick={async () => {
                                if (!ttEditName.trim()) return
                                setTtError(null)
                                setTtSuccess(null)
                                setTtSavingId(t.id)
                                try {
                                  const cap = Number.parseInt(ttEditCapacity, 10)
                                  await updateTable(t.id, {
                                    name: ttEditName.trim(),
                                    color: ttEditColor.trim() || null,
                                    capacity: Number.isFinite(cap) ? cap : t.capacity,
                                  })
                                  setTtSuccess('Table updated.')
                                  setTtEditingId(null)
                                  setTtEditName('')
                                  setTtEditColor('')
                                  setTtEditCapacity('10')
                                  await refreshTables()
                                  await refreshMissionData()
                                } catch (e) {
                                  setTtError(e instanceof Error ? e.message : 'Failed to update.')
                                } finally {
                                  setTtSavingId(null)
                                }
                              }}
                              className="rounded bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                            >
                              {ttSavingId === t.id ? '…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTtEditingId(null)
                                setTtEditName('')
                                setTtEditColor('')
                                setTtEditCapacity('10')
                                setTtError(null)
                              }}
                              className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {t.name}
                            </span>
                            {!t.is_active && (
                              <span className="rounded bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:text-zinc-300">
                                Inactive
                              </span>
                            )}
                            <span className="text-zinc-500 text-xs">
                              {formatDate(t.created_at)}
                            </span>
                            <div className="ml-auto flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setTtEditingId(t.id)
                                  setTtEditName(t.name)
                                  setTtEditColor(t.color ?? '')
                                  setTtEditCapacity(String(t.capacity ?? 10))
                                  setTtError(null)
                                }}
                                className="rounded border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={
                                  ttArchivingId !== null ||
                                  ttEditingId !== null ||
                                  ttDeletingId !== null
                                }
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      `Archive “${t.name}”?\n\nGuests won’t see this team or its score. Completions, submissions, and greetings stay in the database and can be restored from Archived tables.`
                                    )
                                  )
                                    return
                                  setTtError(null)
                                  setTtSuccess(null)
                                  setTtArchivingId(t.id)
                                  try {
                                    await archiveTable(t.id)
                                    setTtSuccess('Table archived.')
                                    if (ttEditingId === t.id) {
                                      setTtEditingId(null)
                                      setTtEditName('')
                                      setTtEditColor('')
                                    }
                                    await refreshTables()
                                    await refreshMissionData()
                                  } catch (e) {
                                    setTtError(
                                      e instanceof Error ? e.message : 'Failed to archive.'
                                    )
                                  } finally {
                                    setTtArchivingId(null)
                                  }
                                }}
                                className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-200 disabled:opacity-50"
                              >
                                {ttArchivingId === t.id ? '…' : 'Archive'}
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
              </ul>

              {ttTables.some((t) => t.is_archived) ? (
                <div className="mt-6">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Archived tables
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    Restore to bring the team back on guest pages and scoreboard. Permanent
                    delete removes the table row; related completions, assignments, and
                    mission submissions are removed by database rules. Greetings may keep
                    text snapshots with table link cleared.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {ttTables
                      .filter((t) => t.is_archived)
                      .map((t) => (
                        <li
                          key={t.id}
                          className="flex flex-wrap items-center gap-2 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100/60 dark:bg-zinc-900/70 px-2 py-1.5 text-sm"
                        >
                          {t.color ? (
                            <span
                              className="h-4 w-4 shrink-0 rounded border border-zinc-300 dark:border-zinc-600 opacity-80"
                              style={{ backgroundColor: t.color }}
                              aria-hidden
                            />
                          ) : null}
                          <span className="font-medium text-zinc-800 dark:text-zinc-100">
                            {t.name}
                          </span>
                          <span className="rounded bg-zinc-300/80 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-700 dark:text-zinc-300">
                            Archived
                          </span>
                          {t.archived_at ? (
                            <span className="text-xs text-zinc-500">
                              {formatDate(t.archived_at)}
                            </span>
                          ) : null}
                          <div className="ml-auto flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={ttRestoringId !== null || ttDeletingId !== null}
                              onClick={async () => {
                                setTtError(null)
                                setTtSuccess(null)
                                setTtRestoringId(t.id)
                                try {
                                  await restoreTable(t.id)
                                  setTtSuccess('Table restored.')
                                  await refreshTables()
                                  await refreshMissionData()
                                } catch (e) {
                                  setTtError(
                                    e instanceof Error ? e.message : 'Failed to restore.'
                                  )
                                } finally {
                                  setTtRestoringId(null)
                                }
                              }}
                              className="rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:text-emerald-200 disabled:opacity-50"
                            >
                              {ttRestoringId === t.id ? '…' : 'Restore'}
                            </button>
                            <button
                              type="button"
                              disabled={ttRestoringId !== null || ttDeletingId !== null}
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `PERMANENTLY delete “${t.name}”?\n\nThis cannot be undone. Database rules will remove this team’s completions, mission assignments, and mission submissions.`
                                  )
                                )
                                  return
                                setTtError(null)
                                setTtSuccess(null)
                                setTtDeletingId(t.id)
                                try {
                                  await permanentlyDeleteTable(t.id)
                                  setTtSuccess('Table permanently removed.')
                                  await refreshTables()
                                  await refreshMissionData()
                                } catch (e) {
                                  setTtError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Failed to delete table.'
                                  )
                                } finally {
                                  setTtDeletingId(null)
                                }
                              }}
                              className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 text-xs font-medium text-red-800 dark:text-red-200 disabled:opacity-50"
                            >
                              {ttDeletingId === t.id ? '…' : 'Delete forever'}
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
          </section>
        )}

        {mode === 'missions' && (
          <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Mission completions
            </h2>
            <button
              type="button"
              onClick={() => void refreshMissionData()}
              disabled={mcLoading}
              className="rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          {mcLoading && (
            <p className="text-xs text-zinc-500">Loading tables & missions…</p>
          )}
          {!mcLoading && mcError && mcTables.length === 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">{mcError}</p>
          )}
          {!mcLoading && !mcError && mcTables.length === 0 && (
            <p className="text-xs text-zinc-500">No tables found. Add tables in Supabase to use completions.</p>
          )}
          {!mcLoading && mcTables.length > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[140px] flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">Table</label>
                  <select
                    value={mcTableId}
                    onChange={(e) => {
                      setMcTableId(e.target.value)
                      setMcSuccess(null)
                      setMcSuccessPair(null)
                      setMcError(null)
                    }}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Select table…</option>
                    {mcTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[180px] flex-[1.2]">
                  <label className="mb-1 block text-xs text-zinc-500">Mission</label>
                  <select
                    value={mcMissionId}
                    onChange={(e) => {
                      setMcMissionId(e.target.value)
                      setMcSuccess(null)
                      setMcSuccessPair(null)
                      setMcError(null)
                    }}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Select mission…</option>
                    {mcMissions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.points} pts)
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleMarkCompleted()}
                  disabled={
                    !mcTableId ||
                    !mcMissionId ||
                    mcAlreadyDone ||
                    mcSubmitting ||
                    mcMissions.length === 0
                  }
                  className="rounded bg-zinc-900 dark:bg-zinc-100 px-3 py-2 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-40"
                >
                  {mcSubmitting ? 'Saving…' : 'Mark completed'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetCompletion()}
                  disabled={!mcTableId || !mcMissionId || !mcAlreadyDone || mcSubmitting}
                  className="rounded border border-amber-300 dark:border-amber-700 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 disabled:opacity-40"
                >
                  {mcSubmitting ? 'Saving…' : 'Reset completion'}
                </button>
              </div>
              {mcShowDuplicateWarning && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  Already completed for this table and mission.
                </p>
              )}
              {mcError && mcTables.length > 0 && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
                  {mcError}
                </p>
              )}
              {mcShowingJustRecorded && (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">
                  {mcSuccess}
                </p>
              )}
              {mcCompletions.length > 0 && (
                <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                  <p className="mb-2 text-xs font-medium text-zinc-500">Recent completions</p>
                  <div className="max-h-48 overflow-auto rounded border border-zinc-100 dark:border-zinc-800">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
                        <tr className="text-zinc-500">
                          <th className="px-2 py-1.5 font-medium">Table</th>
                          <th className="px-2 py-1.5 font-medium">Mission</th>
                          <th className="px-2 py-1.5 font-medium">Completed at</th>
                        </tr>
                      </thead>
                      <tbody className="text-zinc-700 dark:text-zinc-300">
                        {mcCompletions.map((c) => (
                          <tr
                            key={c.id}
                            className="border-t border-zinc-100 dark:border-zinc-800"
                          >
                            <td className="px-2 py-1.5">
                              {tableNameById.get(c.table_id) ?? c.table_id.slice(0, 8)}
                            </td>
                            <td className="px-2 py-1.5">
                              {missionTitleById.get(c.mission_id) ?? c.mission_id.slice(0, 8)}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-zinc-500">
                              {formatDate(c.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
          </section>
        )}

        {mode === 'submissions' && (
          <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Mission submissions
            </h2>
            <button
              type="button"
              onClick={() => {
                setMsLoading(true)
                void refreshMissionSubmissions()
              }}
              disabled={msLoading}
              className="rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Approve to add leaderboard points (or mark approved if already completed). Reject to allow a new guest submission.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMsSubmissionsView('pending')}
              className={`rounded border px-2 py-1 text-[11px] font-medium ${
                msSubmissionsView === 'pending'
                  ? 'border-zinc-300 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
              }`}
            >
              Pending ({msSubmissions.filter((s) => s.status === 'pending').length})
            </button>
            <button
              type="button"
              onClick={() => setMsSubmissionsView('rejected')}
              className={`rounded border px-2 py-1 text-[11px] font-medium ${
                msSubmissionsView === 'rejected'
                  ? 'border-zinc-300 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
              }`}
            >
              Rejected ({msSubmissions.filter((s) => s.status === 'rejected').length})
            </button>
            <button
              type="button"
              onClick={() => setMsSubmissionsView('all')}
              className={`rounded border px-2 py-1 text-[11px] font-medium ${
                msSubmissionsView === 'all'
                  ? 'border-zinc-300 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
              }`}
            >
              All ({msSubmissions.length})
            </button>
          </div>
          {msError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {msError}
            </p>
          )}
          {msSuccess && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">
              {msSuccess}
            </p>
          )}
          {msLoading && (
            <p className="mt-2 text-xs text-zinc-500">Loading submissions…</p>
          )}
          {!msLoading && !msError && msSubmissions.length === 0 && (
            <p className="mt-2 text-xs text-zinc-500">No submissions yet.</p>
          )}
          {!msLoading && !msError && msSubmissions.length > 0 && (
            <div className="mt-3 space-y-2">
              {msSubmissions.filter((s) => {
                return msSubmissionsView === 'all' ? true : s.status === msSubmissionsView
              }).length === 0 ? (
                <p className="text-xs text-zinc-500">No submissions in this view.</p>
              ) : (
                msSubmissions
                  .filter((s) => {
                    return msSubmissionsView === 'all' ? true : s.status === msSubmissionsView
                  })
                  .map((s) => {
                    const imageUrl =
                      typeof s.submission_data?.image_url === 'string'
                        ? s.submission_data.image_url
                        : null
                    const signatureImageUrl =
                      typeof s.submission_data?.signature_image_url === 'string'
                        ? s.submission_data.signature_image_url
                        : null
                    const videoUrl =
                      typeof s.submission_data?.video_url === 'string'
                        ? s.submission_data.video_url
                        : null
                    const proofUrl = imageUrl ?? signatureImageUrl
                    const isSignatureProof = !!signatureImageUrl && !imageUrl
                    const isPending = s.status === 'pending'
                    const isRejected = s.status === 'rejected'

                    return (
                      <div
                        key={s.id}
                        className={`rounded border p-2 text-xs ${
                          isPending
                            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20'
                            : isRejected
                              ? 'border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/20'
                              : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {s.table_name} → {s.mission_title}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-600 dark:text-zinc-400">
                              <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
                                Mission: {s.mission_validation_label}
                              </span>
                              <span
                                className={`capitalize ${
                                  isPending
                                    ? 'text-amber-700 dark:text-amber-200'
                                    : isRejected
                                      ? 'text-red-700 dark:text-red-200'
                                      : 'text-zinc-700 dark:text-zinc-200'
                                }`}
                              >
                                {s.status}
                              </span>
                              <span className="text-zinc-500">
                                sent as {s.submission_type}
                              </span>
                              <span className="text-zinc-500">
                                {formatDate(s.created_at)}
                              </span>
                              {s.approved_at && (
                                <span className="text-zinc-500">
                                  approved {formatDate(s.approved_at)}
                                </span>
                              )}
                            </div>
                            {isPending && (
                              <p className="mt-1.5 text-[11px] leading-snug text-amber-900/90 dark:text-amber-200/90">
                                {s.pending_review_hint}
                              </p>
                            )}
                            {isRejected && s.review_note && (
                              <p className="mt-1.5 text-[11px] leading-snug text-red-900/90 dark:text-red-200/90">
                                Note: {s.review_note}
                              </p>
                            )}
                          </div>

                          {isPending ? (
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                disabled={msProcessingId !== null || msRejectingId === s.id}
                                onClick={async () => {
                                  setMsSuccess(null)
                                  setMsError(null)
                                  setMsProcessingId(s.id)
                                  try {
                                    const { completionCreated } =
                                      await approveMissionSubmission(s.id)
                                    setMsSuccess(
                                      completionCreated
                                        ? 'Approved — completion added; leaderboard will update.'
                                        : 'Approved — mission was already completed; no duplicate points.'
                                    )
                                    await refreshMissionSubmissions()
                                    await refreshMissionData()
                                  } catch (e) {
                                    setMsError(
                                      e instanceof Error
                                        ? e.message
                                        : 'Approve failed.'
                                    )
                                  } finally {
                                    setMsProcessingId(null)
                                  }
                                }}
                                className="rounded bg-emerald-700 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                              >
                                {msProcessingId === s.id ? '…' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                disabled={msProcessingId !== null}
                                onClick={() => {
                                  setMsSuccess(null)
                                  setMsError(null)
                                  setMsRejectingId(s.id)
                                  setMsRejectNote('')
                                }}
                                className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          ) : isRejected ? (
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                disabled={msProcessingId !== null}
                                onClick={async () => {
                                  setMsSuccess(null)
                                  setMsError(null)
                                  setMsProcessingId(s.id)
                                  try {
                                    await restoreMissionSubmission(s.id)
                                    setMsSuccess('Submission restored to pending.')
                                    await refreshMissionSubmissions()
                                  } catch (e) {
                                    setMsError(
                                      e instanceof Error ? e.message : 'Restore failed.'
                                    )
                                  } finally {
                                    setMsProcessingId(null)
                                  }
                                }}
                                className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 disabled:opacity-50"
                              >
                                {msProcessingId === s.id ? '…' : 'Restore'}
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {isPending && msRejectingId === s.id && (
                          <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950/40">
                            <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                              Rejection note (optional)
                            </label>
                            <textarea
                              value={msRejectNote}
                              onChange={(e) => setMsRejectNote(e.target.value)}
                              rows={2}
                              disabled={msProcessingId !== null}
                              className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 disabled:opacity-60"
                              placeholder="Why are you rejecting this submission?"
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={msProcessingId !== null}
                                onClick={async () => {
                                  setMsSuccess(null)
                                  setMsError(null)
                                  setMsProcessingId(s.id)
                                  try {
                                    await rejectMissionSubmission(
                                      s.id,
                                      msRejectNote.trim() || null
                                    )
                                    setMsSuccess('Submission rejected.')
                                    setMsRejectingId(null)
                                    setMsRejectNote('')
                                    await refreshMissionSubmissions()
                                  } catch (e) {
                                    setMsError(
                                      e instanceof Error ? e.message : 'Reject failed.'
                                    )
                                  } finally {
                                    setMsProcessingId(null)
                                  }
                                }}
                                className="rounded bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                              >
                                {msProcessingId === s.id ? '…' : 'Confirm reject'}
                              </button>
                              <button
                                type="button"
                                disabled={msProcessingId !== null}
                                onClick={() => {
                                  setMsRejectingId(null)
                                  setMsRejectNote('')
                                }}
                                className="rounded border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {proofUrl && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setMediaPreview({
                                  kind: isSignatureProof ? 'signature' : 'image',
                                  src: proofUrl,
                                })
                              }
                              className="w-full"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={proofUrl}
                                alt=""
                                className="max-h-24 max-w-full rounded border border-zinc-200 object-contain dark:border-zinc-700"
                              />
                            </button>
                          </div>
                        )}
                        {videoUrl && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setMediaPreview({ kind: 'video', src: videoUrl })}
                              className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                            >
                              View video
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
              )}
            </div>
          )}

          {mediaPreview && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setMediaPreview(null)}
            >
              <div
                className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
                  <div className="text-xs font-semibold text-zinc-100">
                    Preview
                  </div>
                  <button
                    type="button"
                    onClick={() => setMediaPreview(null)}
                    className="rounded border border-zinc-700 bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
                <div className="p-3 bg-zinc-950">
                  {mediaPreview.kind === 'video' ? (
                    <video
                      src={mediaPreview.src}
                      controls
                      className="w-full max-h-[70vh] rounded-xl bg-black"
                    />
                  ) : (
                    <div
                      className={`flex items-center justify-center rounded-xl ${
                        mediaPreview.kind === 'signature'
                          ? 'bg-zinc-900/80'
                          : 'bg-zinc-900/40'
                      } border border-zinc-800 p-2`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaPreview.src}
                        alt=""
                        className="max-h-[70vh] w-full object-contain rounded-lg"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          </section>
        )}

        {mode === 'missions' && (
          <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Mission Library
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Create and edit missions. Inactive missions stay here but won’t appear in guest quests.
          </p>
          <div className="mt-4 rounded border border-zinc-200 dark:border-zinc-700 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-500">
                  Missions lock (guest submissions)
                </p>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {missionsEnabled === false
                    ? 'Opening soon (paused)'
                    : missionsEnabled === true
                      ? 'Enabled'
                      : 'Loading…'}
                </p>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  role="switch"
                  checked={missionsEnabled === true}
                  disabled={missionsEnabled === null || missionsLockSaving}
                  onChange={async (e) => {
                    const next = e.target.checked
                    setMissionsLockError(null)
                    setMissionsLockSuccess(null)
                    setMissionsLockSaving(true)
                    try {
                      await persistMissionsEnabled(next)
                      setMissionsEnabledState(next)
                      setMissionsLockSuccess(
                        next ? 'Missions enabled for guests.' : 'Missions paused.'
                      )
                    } catch (err) {
                      setMissionsLockError(
                        err instanceof Error
                          ? err.message
                          : 'Failed to update mission lock.'
                      )
                    } finally {
                      setMissionsLockSaving(false)
                    }
                  }}
                />
                <span className="text-xs text-zinc-700 dark:text-zinc-200">
                  {missionsLockSaving ? 'Saving…' : 'Toggle'}
                </span>
              </label>
            </div>

            {missionsLockError && (
              <p className="mb-1 text-xs text-red-600 dark:text-red-400" role="alert">
                {missionsLockError}
              </p>
            )}
            {missionsLockSuccess && (
              <p
                className="mb-1 text-xs text-emerald-700 dark:text-emerald-400"
                role="status"
              >
                {missionsLockSuccess}
              </p>
            )}
          </div>
          {mmError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {mmError}
            </p>
          )}
          {mmSuccess && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">
              {mmSuccess}
            </p>
          )}
          <div className="mt-4 rounded border border-zinc-200 dark:border-zinc-700 p-3">
            <p className="mb-2 text-xs font-medium text-zinc-500">New mission</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input
                placeholder="Title"
                value={mmCreate.title}
                onChange={(e) => {
                  setMmCreate((s) => ({ ...s, title: e.target.value }))
                  setMmError(null)
                  setMmSuccess(null)
                }}
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Points"
                type="number"
                min={0}
                value={mmCreate.points}
                onChange={(e) => {
                  setMmCreate((s) => ({ ...s, points: e.target.value }))
                  setMmError(null)
                  setMmSuccess(null)
                }}
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              />
              <select
                value={mmCreate.validation_type}
                onChange={(e) =>
                  setMmCreate((s) => ({
                    ...s,
                    validation_type: e.target.value as ValidationType,
                  }))
                }
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              >
                {VALIDATION_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={mmCreate.approval_mode}
                onChange={(e) =>
                  setMmCreate((s) => ({
                    ...s,
                    approval_mode: e.target.value as ApprovalMode,
                  }))
                }
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              >
                {APPROVAL_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={mmCreate.is_active}
                  onChange={(e) =>
                    setMmCreate((s) => ({ ...s, is_active: e.target.checked }))
                  }
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={mmCreate.add_to_greetings}
                  onChange={(e) =>
                    setMmCreate((s) => ({ ...s, add_to_greetings: e.target.checked }))
                  }
                />
                Add to greetings
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={mmCreate.allow_multiple_submissions}
                  onChange={(e) =>
                    setMmCreate((s) => ({ ...s, allow_multiple_submissions: e.target.checked }))
                  }
                />
                Multiple submissions
              </label>
              <input
                placeholder="Pts per submission"
                type="number"
                min={0}
                value={mmCreate.points_per_submission}
                onChange={(e) =>
                  setMmCreate((s) => ({ ...s, points_per_submission: e.target.value }))
                }
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm w-24"
                title="Points per submission (when multiple allowed)"
              />
              <input
                placeholder="Target person (signature)"
                type="text"
                value={mmCreate.target_person_name}
                onChange={(e) =>
                  setMmCreate((s) => ({ ...s, target_person_name: e.target.value }))
                }
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm flex-1 min-w-0"
                title="Who must sign (e.g. Alex)"
              />
              <input
                placeholder="Submission hint (signature)"
                type="text"
                value={mmCreate.submission_hint}
                onChange={(e) =>
                  setMmCreate((s) => ({ ...s, submission_hint: e.target.value }))
                }
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm flex-1 min-w-0"
                title="Guidance for guest (e.g. Use the seat finder)"
              />
              <input
                placeholder="Header title (modal)"
                type="text"
                value={mmCreate.header_title}
                onChange={(e) =>
                  setMmCreate((s) => ({ ...s, header_title: e.target.value }))
                }
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm flex-1 min-w-0"
                title="Optional display title in modal header"
              />
              <input
                placeholder="Header image URL (modal)"
                type="text"
                value={mmCreate.header_image_url}
                onChange={(e) =>
                  setMmCreate((s) => ({ ...s, header_image_url: e.target.value }))
                }
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm flex-1 min-w-0"
                title="Optional image URL for modal header"
              />
            </div>
            <textarea
              placeholder="Description"
              value={mmCreate.description}
              onChange={(e) => {
                setMmCreate((s) => ({ ...s, description: e.target.value }))
                setMmError(null)
                setMmSuccess(null)
              }}
              rows={2}
              className="mt-2 w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={mmCreating || !mmCreate.title.trim()}
              onClick={async () => {
                setMmError(null)
                setMmSuccess(null)
                setMmCreating(true)
                try {
                  await createMission({
                    title: mmCreate.title,
                    description: mmCreate.description,
                    points: Number(mmCreate.points) || 0,
                    validation_type: mmCreate.validation_type,
                    approval_mode: mmCreate.approval_mode,
                    is_active: mmCreate.is_active,
                    add_to_greetings: mmCreate.add_to_greetings,
                    allow_multiple_submissions: mmCreate.allow_multiple_submissions,
                    points_per_submission: mmCreate.points_per_submission === '' ? null : Number(mmCreate.points_per_submission) || null,
                    target_person_name: mmCreate.target_person_name.trim() || null,
                    submission_hint: mmCreate.submission_hint.trim() || null,
                    header_title: mmCreate.header_title.trim() || null,
                    header_image_url: mmCreate.header_image_url.trim() || null,
                  })
                  setMmSuccess('Mission created.')
                  setMmCreate({
                    title: '',
                    description: '',
                    points: '10',
                    validation_type: 'photo',
                    approval_mode: 'auto',
                    is_active: true,
                    add_to_greetings: false,
                    allow_multiple_submissions: false,
                    points_per_submission: '',
                    target_person_name: '',
                    submission_hint: '',
                    header_title: '',
                    header_image_url: '',
                  })
                  await refreshMissionData()
                  await refreshMmList()
                } catch (e) {
                  setMmError(e instanceof Error ? e.message : 'Create failed.')
                } finally {
                  setMmCreating(false)
                }
              }}
              className="mt-2 rounded bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-40"
            >
              {mmCreating ? 'Saving…' : 'Create mission'}
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700 text-zinc-500">
                  <th className="pb-2 pr-2 font-medium">Title</th>
                  <th className="pb-2 pr-2 font-medium">Description</th>
                  <th className="pb-2 pr-2 font-medium">Pts</th>
                  <th className="pb-2 pr-2 font-medium">Validation</th>
                  <th className="pb-2 pr-2 font-medium">Approval</th>
                  <th className="pb-2 pr-2 font-medium">Status</th>
                  <th className="pb-2 pr-2 font-medium">Created</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="text-zinc-700 dark:text-zinc-300">
                {mmMissions.map((m) => (
                  <Fragment key={m.id}>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 align-top">
                      <td className="py-2 pr-2 font-medium">{m.title}</td>
                      <td className="max-w-[180px] py-2 pr-2 truncate text-zinc-500" title={m.description ?? ''}>
                        {m.description || '—'}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{m.points}</td>
                      <td className="py-2 pr-2">{m.validation_type}</td>
                      <td className="py-2 pr-2">{m.approval_mode}</td>
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          disabled={mmSavingId === m.id}
                          onClick={async () => {
                            setMmError(null)
                            setMmSuccess(null)
                            setMmSavingId(m.id)
                            try {
                              await updateMission(m.id, { is_active: !m.is_active })
                              setMmSuccess(m.is_active ? 'Mission deactivated.' : 'Mission activated.')
                              await refreshMissionData()
                              await refreshMmList()
                            } catch (e) {
                              setMmError(e instanceof Error ? e.message : 'Update failed.')
                            } finally {
                              setMmSavingId(null)
                            }
                          }}
                          className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-0.5 text-[10px] uppercase tracking-wide disabled:opacity-40"
                        >
                          {mmSavingId === m.id
                            ? '…'
                            : m.is_active
                              ? 'Active'
                              : 'Inactive'}
                        </button>
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap text-[10px] text-zinc-500">
                        {formatDate(m.created_at)}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setMmEditingId(mmEditingId === m.id ? null : m.id)
                            setMmEdit({
                              title: m.title,
                              description: m.description ?? '',
                              points: String(m.points),
                              validation_type: (VALIDATION_TYPES.includes(
                                m.validation_type as ValidationType
                              )
                                ? m.validation_type
                                : 'photo') as ValidationType,
                              approval_mode: (APPROVAL_MODES.includes(
                                m.approval_mode as ApprovalMode
                              )
                                ? (m.approval_mode as ApprovalMode)
                                : 'auto') as ApprovalMode,
                              is_active: m.is_active,
                              add_to_greetings: m.add_to_greetings ?? false,
                              allow_multiple_submissions: m.allow_multiple_submissions ?? false,
                              points_per_submission: m.points_per_submission ?? '',
                              target_person_name: m.target_person_name ?? '',
                              submission_hint: m.submission_hint ?? '',
                              header_title: m.header_title ?? '',
                              header_image_url: m.header_image_url ?? '',
                            })
                            setMmError(null)
                            setMmSuccess(null)
                          }}
                          className="text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                        >
                          {mmEditingId === m.id ? 'Close' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                    {mmEditingId === m.id && (
                      <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/50">
                        <td colSpan={8} className="p-3">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <input
                              value={mmEdit.title}
                              onChange={(e) =>
                                setMmEdit((s) => ({ ...s, title: e.target.value }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              min={0}
                              value={mmEdit.points}
                              onChange={(e) =>
                                setMmEdit((s) => ({ ...s, points: e.target.value }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm"
                            />
                            <select
                              value={mmEdit.validation_type}
                              onChange={(e) =>
                                setMmEdit((s) => ({
                                  ...s,
                                  validation_type: e.target.value as ValidationType,
                                }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm"
                            >
                              {VALIDATION_TYPES.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                            <select
                              value={mmEdit.approval_mode}
                              onChange={(e) =>
                                setMmEdit((s) => ({
                                  ...s,
                                  approval_mode: e.target.value as ApprovalMode,
                                }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm"
                            >
                              {APPROVAL_MODES.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={mmEdit.is_active}
                                onChange={(e) =>
                                  setMmEdit((s) => ({
                                    ...s,
                                    is_active: e.target.checked,
                                  }))
                                }
                              />
                              Active
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={mmEdit.add_to_greetings}
                                onChange={(e) =>
                                  setMmEdit((s) => ({
                                    ...s,
                                    add_to_greetings: e.target.checked,
                                  }))
                                }
                              />
                              Add to greetings
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={mmEdit.allow_multiple_submissions}
                                onChange={(e) =>
                                  setMmEdit((s) => ({
                                    ...s,
                                    allow_multiple_submissions: e.target.checked,
                                  }))
                                }
                              />
                              Multiple submissions
                            </label>
                            <input
                              type="number"
                              min={0}
                              placeholder="Pts/submission"
                              value={mmEdit.points_per_submission}
                              onChange={(e) =>
                                setMmEdit((s) => ({
                                  ...s,
                                  points_per_submission: e.target.value,
                                }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm w-24"
                              title="Points per submission (when multiple allowed)"
                            />
                            <input
                              placeholder="Target person (signature)"
                              type="text"
                              value={mmEdit.target_person_name}
                              onChange={(e) =>
                                setMmEdit((s) => ({ ...s, target_person_name: e.target.value }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm flex-1 min-w-0"
                            />
                            <input
                              placeholder="Submission hint (signature)"
                              type="text"
                              value={mmEdit.submission_hint}
                              onChange={(e) =>
                                setMmEdit((s) => ({ ...s, submission_hint: e.target.value }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm flex-1 min-w-0"
                            />
                            <input
                              placeholder="Header title (modal)"
                              type="text"
                              value={mmEdit.header_title}
                              onChange={(e) =>
                                setMmEdit((s) => ({ ...s, header_title: e.target.value }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm flex-1 min-w-0"
                            />
                            <input
                              placeholder="Header image URL (modal)"
                              type="text"
                              value={mmEdit.header_image_url}
                              onChange={(e) =>
                                setMmEdit((s) => ({ ...s, header_image_url: e.target.value }))
                              }
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm flex-1 min-w-0"
                            />
                          </div>
                          <textarea
                            value={mmEdit.description}
                            onChange={(e) =>
                              setMmEdit((s) => ({ ...s, description: e.target.value }))
                            }
                            rows={2}
                            className="mt-2 w-full rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1.5 text-sm"
                          />
                          <button
                            type="button"
                            disabled={mmSavingId === m.id || !mmEdit.title.trim()}
                            onClick={async () => {
                              setMmSavingId(m.id)
                              setMmError(null)
                              setMmSuccess(null)
                              try {
                                await updateMission(m.id, {
                                  title: mmEdit.title,
                                  description: mmEdit.description,
                                  points: Number(mmEdit.points) || 0,
                                  validation_type: mmEdit.validation_type,
                                  approval_mode: mmEdit.approval_mode,
                                  is_active: mmEdit.is_active,
                                  add_to_greetings: mmEdit.add_to_greetings,
                                  allow_multiple_submissions: mmEdit.allow_multiple_submissions,
                                  points_per_submission: mmEdit.points_per_submission === '' ? null : Number(mmEdit.points_per_submission) || null,
                                  target_person_name: mmEdit.target_person_name.trim() || null,
                                  submission_hint: mmEdit.submission_hint.trim() || null,
                                  header_title: mmEdit.header_title.trim() || null,
                                  header_image_url: mmEdit.header_image_url.trim() || null,
                                })
                                setMmSuccess('Mission updated.')
                                setMmEditingId(null)
                                await refreshMissionData()
                                await refreshMmList()
                              } catch (e) {
                                setMmError(e instanceof Error ? e.message : 'Save failed.')
                              } finally {
                                setMmSavingId(null)
                              }
                            }}
                            className="mt-2 rounded bg-zinc-800 dark:bg-zinc-200 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-40"
                          >
                            {mmSavingId === m.id ? 'Saving…' : 'Save changes'}
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {mmMissions.length === 0 && !mcLoading && (
              <p className="py-4 text-center text-xs text-zinc-500">No missions yet.</p>
            )}
          </div>

          {/* Assignment UI */}
          <div className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Assignment UI
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Choose which tables each mission is available for.
              </p>
            </div>

            {maAssignmentsError && (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">
                {maAssignmentsError}
              </p>
            )}
            {maAssignError && (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">
                {maAssignError}
              </p>
            )}
            {maAssignSuccess && (
              <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">
                {maAssignSuccess}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1 block text-xs text-zinc-500">Mission</label>
                <select
                  value={maSelectedMissionId}
                  onChange={(e) => {
                    setMaAssignSuccess(null)
                    setMaAssignError(null)
                    setMaSelectedMissionId(e.target.value)
                  }}
                  disabled={maAssignmentsLoading || mmMissions.length === 0}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
                >
                  {mmMissions.length === 0 ? (
                    <option value="">No missions</option>
                  ) : (
                    mmMissions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <label className="flex items-center gap-2 rounded border border-zinc-200 dark:border-zinc-800 p-2">
                <input
                  type="checkbox"
                  checked={maAssignToAllTables}
                  disabled={
                    maAssignmentsLoading || maAssignSaving || activeTableIdsForAssignment.length === 0
                  }
                  onChange={(e) => {
                    const next = e.target.checked
                    setMaAssignSuccess(null)
                    setMaAssignError(null)
                    setMaAssignToAllTables(next)
                    if (next) setMaSelectedTableIds(new Set(activeTableIdsForAssignment))
                  }}
                />
                <span className="text-xs text-zinc-700 dark:text-zinc-200">
                  Assign to all active tables
                </span>
              </label>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-500">Tables</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {maAssignToAllTables
                    ? `${activeTableIdsForAssignment.length} selected`
                    : `${maSelectedTableIds.size} selected`}
                </p>
              </div>

              <div className="mt-2 max-h-40 overflow-auto rounded border border-zinc-200 dark:border-zinc-800 p-3">
                {activeTablesForAssignment.length === 0 ? (
                  <p className="text-xs text-zinc-500">No active tables yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {activeTablesForAssignment.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-200"
                      >
                        <input
                          type="checkbox"
                          checked={maSelectedTableIds.has(t.id)}
                          disabled={maAssignSaving || maAssignToAllTables}
                          onChange={(e) => {
                            const nextChecked = e.target.checked
                            setMaAssignSuccess(null)
                            setMaAssignError(null)
                            setMaAssignToAllTables(false)
                            setMaSelectedTableIds((prev) => {
                              const next = new Set(prev)
                              if (nextChecked) next.add(t.id)
                              else next.delete(t.id)
                              return next
                            })
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        {t.color ? (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded"
                            style={{ backgroundColor: t.color }}
                            aria-hidden
                          />
                        ) : null}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={
                  maAssignSaving ||
                  maAssignmentsLoading ||
                  !maSelectedMissionId ||
                  activeTableIdsForAssignment.length === 0
                }
                onClick={async () => {
                  setMaAssignError(null)
                  setMaAssignSuccess(null)
                  setMaAssignSaving(true)
                  try {
                    const desiredTableIds = maAssignToAllTables
                      ? activeTableIdsForAssignment
                      : Array.from(maSelectedTableIds)

                    await setMissionAssignmentsForMission({
                      missionId: maSelectedMissionId,
                      desiredTableIds,
                      activeTableIds: activeTableIdsForAssignment,
                    })

                    setMaAssignSuccess('Assignments updated.')
                    await refreshMissionAssignments()
                  } catch (e) {
                    setMaAssignError(
                      e instanceof Error ? e.message : 'Failed to save assignments.'
                    )
                  } finally {
                    setMaAssignSaving(false)
                  }
                }}
                className="rounded bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-40"
              >
                {maAssignSaving ? 'Saving…' : 'Save assignments'}
              </button>
            </div>
          </div>
          </section>
        )}

        {mode === 'greetings' && (
          <>
            <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Admin · Greetings
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{headerSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
 
        {error && (
          <div
            className="mb-4 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            className="mb-4 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
            role="status"
          >
            {successMessage}
          </div>
        )}

        {storageWarning && (
          <div
            className="mb-4 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
            role="status"
          >
            {storageWarning}
          </div>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2"
              >
                <div className="h-16 w-16 shrink-0 rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <div className="h-3.5 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-3.5 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
                  </div>
                  <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div className="h-3 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !hasGreetings && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-6 text-center">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No greetings yet</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Once guests submit greetings, they’ll show up here.
            </p>
          </div>
        )}

        {!loading && hasGreetings && (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {rows.map((row) => {
              const displayName = row.name?.trim() ? row.name.trim() : 'Anonymous'

              return (
                <div
                  key={row.id}
                  className="flex gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    <img
                      src={row.image_url}
                      alt={`${displayName}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {displayName}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(row.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
                      {row.message}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="rounded border border-zinc-200 dark:border-zinc-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {row.status}
                      </span>
                      <a
                        href={row.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        Open image
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row)}
                        disabled={deletingId === row.id}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        {deletingId === row.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  )
}
