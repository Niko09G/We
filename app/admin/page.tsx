'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  createMission,
  listMissions,
  updateMission,
  VALIDATION_TYPES,
  type MissionRecord,
  type ValidationType,
} from '@/lib/admin-missions'
import {
  fetchAdminMissionData,
  insertCompletion,
  type AdminCompletion,
  type AdminMission,
  type AdminTable,
} from '@/lib/admin-completions'
import { deleteGreeting, listGreetings, type GreetingRow } from '@/lib/greetings-admin'
import {
  approveMissionSubmission,
  listMissionSubmissionsForAdmin,
  rejectMissionSubmission,
  type MissionSubmissionRow,
} from '@/lib/admin-mission-submissions'
import {
  createTable,
  listTablesForAdmin,
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
    validation_type: 'manual' as ValidationType,
    is_active: true,
  })
  const [mmEditingId, setMmEditingId] = useState<string | null>(null)
  const [mmEdit, setMmEdit] = useState({
    title: '',
    description: '',
    points: '0',
    validation_type: 'manual' as ValidationType,
    is_active: true,
  })
  const [mmSavingId, setMmSavingId] = useState<string | null>(null)
  const [mmMissions, setMmMissions] = useState<MissionRecord[]>([])

  const [msSubmissions, setMsSubmissions] = useState<MissionSubmissionRow[]>([])
  const [msLoading, setMsLoading] = useState(true)
  const [msError, setMsError] = useState<string | null>(null)
  const [msSuccess, setMsSuccess] = useState<string | null>(null)
  const [msProcessingId, setMsProcessingId] = useState<string | null>(null)

  const [ttTables, setTtTables] = useState<AdminTableRow[]>([])
  const [ttLoading, setTtLoading] = useState(true)
  const [ttError, setTtError] = useState<string | null>(null)
  const [ttSuccess, setTtSuccess] = useState<string | null>(null)
  const [ttCreating, setTtCreating] = useState(false)
  const [ttCreate, setTtCreate] = useState({ name: '', color: '', is_active: true })
  const [ttEditingId, setTtEditingId] = useState<string | null>(null)
  const [ttEditName, setTtEditName] = useState('')
  const [ttSavingId, setTtSavingId] = useState<string | null>(null)

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
    void refreshMissionData()
    void refreshMmList()
    void refreshMissionSubmissions()
  }, [refreshTables, refreshMissionData, refreshMmList, refreshMissionSubmissions])

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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-6 md:px-6">
      <div className="mx-auto w-full max-w-5xl">
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
            <div className="flex flex-wrap items-end gap-2">
              <input
                placeholder="Name"
                value={ttCreate.name}
                onChange={(e) => {
                  setTtCreate((s) => ({ ...s, name: e.target.value }))
                  setTtError(null)
                  setTtSuccess(null)
                }}
                className="min-w-[120px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Color (e.g. #3b82f6)"
                value={ttCreate.color}
                onChange={(e) => {
                  setTtCreate((s) => ({ ...s, color: e.target.value }))
                  setTtError(null)
                  setTtSuccess(null)
                }}
                className="w-28 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
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
              <button
                type="button"
                disabled={ttCreating || !ttCreate.name.trim()}
                onClick={async () => {
                  setTtError(null)
                  setTtSuccess(null)
                  setTtCreating(true)
                  try {
                    await createTable({
                      name: ttCreate.name.trim(),
                      color: ttCreate.color.trim() || null,
                      is_active: ttCreate.is_active,
                    })
                    setTtSuccess('Table created.')
                    setTtCreate({ name: '', color: '', is_active: true })
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
          {ttLoading && (
            <p className="mt-3 text-xs text-zinc-500">Loading tables…</p>
          )}
          {!ttLoading && ttTables.length === 0 && (
            <p className="mt-3 text-xs text-zinc-500">No tables yet. Create one above.</p>
          )}
          {!ttLoading && ttTables.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {ttTables.map((t) => {
                const isEditing = ttEditingId === t.id
                return (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 rounded border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 px-2 py-1.5 text-sm"
                  >
                    {t.color && (
                      <span
                        className="h-4 w-4 shrink-0 rounded border border-zinc-200 dark:border-zinc-600"
                        style={{ backgroundColor: t.color }}
                        aria-hidden
                      />
                    )}
                    {isEditing ? (
                      <>
                        <input
                          value={ttEditName}
                          onChange={(e) => setTtEditName(e.target.value)}
                          className="min-w-[120px] flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
                          autoFocus
                        />
                        <button
                          type="button"
                          disabled={ttSavingId !== null || !ttEditName.trim()}
                          onClick={async () => {
                            if (!ttEditName.trim()) return
                            setTtError(null)
                            setTtSuccess(null)
                            setTtSavingId(t.id)
                            try {
                              await updateTable(t.id, { name: ttEditName.trim() })
                              setTtSuccess('Table updated.')
                              setTtEditingId(null)
                              setTtEditName('')
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
                        <button
                          type="button"
                          onClick={() => {
                            setTtEditingId(t.id)
                            setTtEditName(t.name)
                            setTtError(null)
                          }}
                          className="ml-auto rounded border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

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
          {!msLoading && msSubmissions.length > 0 && (
            <div className="mt-3 space-y-2">
              {msSubmissions.map((s) => {
                const imageUrl =
                  typeof s.submission_data?.image_url === 'string'
                    ? s.submission_data.image_url
                    : null
                const isPending = s.status === 'pending'
                return (
                  <div
                    key={s.id}
                    className={`rounded border p-2 text-xs ${
                      isPending
                        ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20'
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
                          <span className="capitalize">{s.status}</span>
                          <span className="text-zinc-500">
                            sent as {s.submission_type}
                          </span>
                          <span className="text-zinc-500">{formatDate(s.created_at)}</span>
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
                      </div>
                      {isPending && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            disabled={msProcessingId !== null}
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
                                  e instanceof Error ? e.message : 'Approve failed.'
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
                            onClick={async () => {
                              setMsSuccess(null)
                              setMsError(null)
                              setMsProcessingId(s.id)
                              try {
                                await rejectMissionSubmission(s.id)
                                setMsSuccess('Submission rejected.')
                                await refreshMissionSubmissions()
                              } catch (e) {
                                setMsError(
                                  e instanceof Error ? e.message : 'Reject failed.'
                                )
                              } finally {
                                setMsProcessingId(null)
                              }
                            }}
                            className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 disabled:opacity-50"
                          >
                            {msProcessingId === s.id ? '…' : 'Reject'}
                          </button>
                        </div>
                      )}
                    </div>
                    {imageUrl && (
                      <div className="mt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt=""
                          className="max-h-24 max-w-full rounded border border-zinc-200 object-contain dark:border-zinc-700"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Missions
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Create and edit missions. Inactive missions stay here but won’t appear in manual completion or guest flows.
          </p>
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
                    is_active: mmCreate.is_active,
                  })
                  setMmSuccess('Mission created.')
                  setMmCreate({
                    title: '',
                    description: '',
                    points: '10',
                    validation_type: 'manual',
                    is_active: true,
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
                                : 'manual') as ValidationType,
                              is_active: m.is_active,
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
                        <td colSpan={7} className="p-3">
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
                                  is_active: mmEdit.is_active,
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
        </section>

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
      </div>
    </div>
  )
}
