'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  APPROVAL_MODES,
  VALIDATION_TYPES,
  createMission,
  listMissions,
  updateMission,
  type ApprovalMode,
  type MissionRecord,
  type ValidationType,
} from '@/lib/admin-missions'
import {
  listActiveMissionAssignmentsForAdmin,
  setMissionAssignmentsForMission,
} from '@/lib/admin-mission-assignments'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'

function typeIcon(type: string): string {
  if (type === 'photo') return '📷'
  if (type === 'video') return '🎥'
  if (type === 'signature') return '✍️'
  return '•'
}

export default function MissionsAdminPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [missions, setMissions] = useState<MissionRecord[]>([])
  const [tables, setTables] = useState<AdminTableRow[]>([])
  const [assignmentsByMission, setAssignmentsByMission] = useState<Record<string, string[]>>({})

  const [assigningKey, setAssigningKey] = useState<string | null>(null)
  const [addPickerTableId, setAddPickerTableId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null)
  const [savingMissionId, setSavingMissionId] = useState<string | null>(null)

  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    points: '10',
    validation_type: 'photo' as ValidationType,
    approval_mode: 'auto' as ApprovalMode,
    add_to_greetings: false,
    allow_multiple_submissions: false,
    points_per_submission: '',
    header_title: '',
    header_image_url: '',
    target_person_name: '',
    submission_hint: '',
    message_required: false,
    is_active: true,
  })
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    points: '0',
    validation_type: 'photo' as ValidationType,
    approval_mode: 'auto' as ApprovalMode,
    add_to_greetings: false,
    allow_multiple_submissions: false,
    points_per_submission: '',
    header_title: '',
    header_image_url: '',
    target_person_name: '',
    submission_hint: '',
    message_required: false,
    is_active: true,
  })

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mList, tList, aMap] = await Promise.all([
        listMissions(),
        listTablesForAdmin(),
        listActiveMissionAssignmentsForAdmin(),
      ])
      setMissions(mList)
      setTables(tList)
      setAssignmentsByMission(aMap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load missions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activeTables = useMemo(
    () =>
      tables.filter(
        (t) => (t.is_active ?? true) === true && (t.is_archived ?? false) === false
      ),
    [tables]
  )
  const activeTableIds = useMemo(() => activeTables.map((t) => t.id), [activeTables])
  const activeMissionTemplates = useMemo(
    () => missions.filter((m) => (m.is_active ?? true) === true),
    [missions]
  )

  function assignedMissionIdsForTable(tableId: string): string[] {
    return Object.entries(assignmentsByMission)
      .filter(([, tableIds]) => tableIds.includes(tableId))
      .map(([missionId]) => missionId)
  }

  async function setAssignmentForTable(tableId: string, nextMissionIds: string[]) {
    setError(null)
    setSuccess(null)

    const currentlyAssigned = assignedMissionIdsForTable(tableId)
    const toUpdateMissionIds = new Set<string>([...currentlyAssigned, ...nextMissionIds])

    try {
      for (const missionId of toUpdateMissionIds) {
        setAssigningKey(`${tableId}:${missionId}`)
        const prevTableIds = assignmentsByMission[missionId] ?? []
        const nextTableIds = nextMissionIds.includes(missionId)
          ? Array.from(new Set([...prevTableIds, tableId]))
          : prevTableIds.filter((id) => id !== tableId)

        await setMissionAssignmentsForMission({
          missionId,
          desiredTableIds: nextTableIds,
          activeTableIds,
        })

        setAssignmentsByMission((prev) => ({
          ...prev,
          [missionId]: nextTableIds,
        }))
      }
      setSuccess('Assignments updated.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update assignments.')
    } finally {
      setAssigningKey(null)
    }
  }

  async function handleUnassign(tableId: string, missionId: string) {
    const current = assignedMissionIdsForTable(tableId)
    const next = current.filter((id) => id !== missionId)
    await setAssignmentForTable(tableId, next)
  }

  async function handleAddMission(tableId: string, missionId: string) {
    const current = assignedMissionIdsForTable(tableId)
    if (current.includes(missionId)) return
    await setAssignmentForTable(tableId, [...current, missionId])
    setAddPickerTableId(null)
  }

  async function handleCreateMission() {
    if (!createForm.title.trim()) return
    setCreating(true)
    setError(null)
    setSuccess(null)
    try {
      await createMission({
        title: createForm.title,
        description: createForm.description,
        points: Number(createForm.points) || 0,
        validation_type: createForm.validation_type,
        approval_mode: createForm.approval_mode,
        add_to_greetings: createForm.add_to_greetings,
        allow_multiple_submissions: createForm.allow_multiple_submissions,
        points_per_submission:
          createForm.points_per_submission === ''
            ? null
            : Number(createForm.points_per_submission) || null,
        header_title: createForm.header_title || null,
        header_image_url: createForm.header_image_url || null,
        target_person_name: createForm.target_person_name || null,
        submission_hint: createForm.submission_hint || null,
        message_required: createForm.message_required,
        is_active: createForm.is_active,
      })
      setCreateForm({
        title: '',
        description: '',
        points: '10',
        validation_type: 'photo',
        approval_mode: 'auto',
        add_to_greetings: false,
        allow_multiple_submissions: false,
        points_per_submission: '',
        header_title: '',
        header_image_url: '',
        target_person_name: '',
        submission_hint: '',
        message_required: false,
        is_active: true,
      })
      setSuccess('Mission created.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed.')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(m: MissionRecord) {
    setEditingMissionId(m.id)
    setEditForm({
      title: m.title,
      description: m.description ?? '',
      points: String(m.points ?? 0),
      validation_type: VALIDATION_TYPES.includes(m.validation_type as ValidationType)
        ? (m.validation_type as ValidationType)
        : 'photo',
      approval_mode: APPROVAL_MODES.includes(m.approval_mode as ApprovalMode)
        ? (m.approval_mode as ApprovalMode)
        : 'auto',
      add_to_greetings: m.add_to_greetings ?? false,
      allow_multiple_submissions: m.allow_multiple_submissions ?? false,
      points_per_submission:
        m.points_per_submission == null ? '' : String(m.points_per_submission),
      header_title: m.header_title ?? '',
      header_image_url: m.header_image_url ?? '',
      target_person_name: m.target_person_name ?? '',
      submission_hint: m.submission_hint ?? '',
      message_required: m.message_required ?? false,
      is_active: m.is_active ?? true,
    })
  }

  async function saveEdit(missionId: string) {
    setSavingMissionId(missionId)
    setError(null)
    setSuccess(null)
    try {
      await updateMission(missionId, {
        title: editForm.title,
        description: editForm.description,
        points: Number(editForm.points) || 0,
        validation_type: editForm.validation_type,
        approval_mode: editForm.approval_mode,
        add_to_greetings: editForm.add_to_greetings,
        allow_multiple_submissions: editForm.allow_multiple_submissions,
        points_per_submission:
          editForm.points_per_submission === ''
            ? null
            : Number(editForm.points_per_submission) || null,
        header_title: editForm.header_title || null,
        header_image_url: editForm.header_image_url || null,
        target_person_name: editForm.target_person_name || null,
        submission_hint: editForm.submission_hint || null,
        message_required: editForm.message_required,
        is_active: editForm.is_active,
      })
      setEditingMissionId(null)
      setSuccess('Mission updated.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.')
    } finally {
      setSavingMissionId(null)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-500">Loading mission board…</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Missions
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Table mission board for assignment setup, plus mission library and creation below.
        </p>
        <Link
          href="/admin"
          className="mt-2 inline-block text-sm font-medium text-zinc-600 underline hover:no-underline dark:text-zinc-400"
        >
          Back to admin
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          {success}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Table Mission Board
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          One column per active table. Remove mission chips or add missions from the picker.
        </p>

        {activeTables.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No active tables available.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div className="flex gap-4 pb-2 min-w-max">
              {activeTables.map((table) => {
                const assignedIds = assignedMissionIdsForTable(table.id)
                const assignedMissions = assignedIds
                  .map((id) => missions.find((m) => m.id === id))
                  .filter(Boolean) as MissionRecord[]
                const availableToAdd = activeMissionTemplates.filter(
                  (m) => !assignedIds.includes(m.id)
                )

                return (
                  <div
                    key={table.id}
                    className="w-72 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {table.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {assignedMissions.length} mission
                          {assignedMissions.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <span
                        className="h-3 w-3 rounded-full border border-white/30"
                        style={{ backgroundColor: table.color ?? '#71717a' }}
                        aria-hidden
                      />
                    </div>

                    <div className="mt-3 space-y-2 min-h-[80px]">
                      {assignedMissions.length === 0 ? (
                        <div className="rounded border border-dashed border-zinc-300 px-2 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          No missions assigned
                        </div>
                      ) : (
                        assignedMissions.map((m) => {
                          const busy = assigningKey === `${table.id}:${m.id}`
                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            >
                              <div className="min-w-0 flex items-center gap-1.5">
                                <span aria-hidden>{typeIcon(m.validation_type)}</span>
                                <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                                  {m.title}
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleUnassign(table.id, m.id)}
                                className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                              >
                                {busy ? '…' : 'Remove'}
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>

                    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      {addPickerTableId === table.id ? (
                        <div className="space-y-2">
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const missionId = e.target.value
                              if (!missionId) return
                              handleAddMission(table.id, missionId)
                            }}
                            className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            <option value="">Select mission to add…</option>
                            {availableToAdd.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.title} ({m.validation_type})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setAddPickerTableId(null)}
                            className="text-[11px] text-zinc-500 underline hover:no-underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={availableToAdd.length === 0}
                          onClick={() => setAddPickerTableId(table.id)}
                          className="w-full rounded border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          + Add mission
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Mission Library / Creation
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Create mission templates and edit existing ones. Assignment is managed in the board above.
        </p>

        <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              placeholder="Title"
              value={createForm.title}
              onChange={(e) =>
                setCreateForm((s) => ({ ...s, title: e.target.value }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="Points"
              type="number"
              min={0}
              value={createForm.points}
              onChange={(e) =>
                setCreateForm((s) => ({ ...s, points: e.target.value }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <select
              value={createForm.validation_type}
              onChange={(e) =>
                setCreateForm((s) => ({
                  ...s,
                  validation_type: e.target.value as ValidationType,
                }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {VALIDATION_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={createForm.approval_mode}
              onChange={(e) =>
                setCreateForm((s) => ({
                  ...s,
                  approval_mode: e.target.value as ApprovalMode,
                }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {APPROVAL_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              placeholder="Header title"
              value={createForm.header_title}
              onChange={(e) =>
                setCreateForm((s) => ({ ...s, header_title: e.target.value }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="Header image URL"
              value={createForm.header_image_url}
              onChange={(e) =>
                setCreateForm((s) => ({ ...s, header_image_url: e.target.value }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="Target person name"
              value={createForm.target_person_name}
              onChange={(e) =>
                setCreateForm((s) => ({ ...s, target_person_name: e.target.value }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="Submission hint"
              value={createForm.submission_hint}
              onChange={(e) =>
                setCreateForm((s) => ({ ...s, submission_hint: e.target.value }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="Points per submission"
              type="number"
              min={0}
              value={createForm.points_per_submission}
              onChange={(e) =>
                setCreateForm((s) => ({
                  ...s,
                  points_per_submission: e.target.value,
                }))
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={createForm.add_to_greetings}
                onChange={(e) =>
                  setCreateForm((s) => ({ ...s, add_to_greetings: e.target.checked }))
                }
              />
              Add to greetings
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={createForm.allow_multiple_submissions}
                onChange={(e) =>
                  setCreateForm((s) => ({
                    ...s,
                    allow_multiple_submissions: e.target.checked,
                  }))
                }
              />
              Multiple submissions
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(e) =>
                  setCreateForm((s) => ({ ...s, is_active: e.target.checked }))
                }
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={createForm.message_required}
                onChange={(e) =>
                  setCreateForm((s) => ({ ...s, message_required: e.target.checked }))
                }
              />
              Message required
            </label>
          </div>

          <textarea
            placeholder="Description"
            value={createForm.description}
            onChange={(e) =>
              setCreateForm((s) => ({ ...s, description: e.target.value }))
            }
            rows={3}
            className="mt-2 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="mt-2">
            <button
              type="button"
              disabled={creating || !createForm.title.trim()}
              onClick={handleCreateMission}
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {creating ? 'Creating…' : 'Create mission'}
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {missions.map((m) => (
            <div
              key={m.id}
              className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-700"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {m.title}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {m.validation_type} · {m.points} pts · {m.approval_mode} ·{' '}
                    {m.is_active ? 'active' : 'inactive'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => (editingMissionId === m.id ? setEditingMissionId(null) : startEdit(m))}
                  className="text-xs font-medium text-zinc-600 underline hover:no-underline dark:text-zinc-300"
                >
                  {editingMissionId === m.id ? 'Close' : 'Edit'}
                </button>
              </div>

              {editingMissionId === m.id ? (
                <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm((s) => ({ ...s, title: e.target.value }))}
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <input
                      type="number"
                      min={0}
                      value={editForm.points}
                      onChange={(e) => setEditForm((s) => ({ ...s, points: e.target.value }))}
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <select
                      value={editForm.validation_type}
                      onChange={(e) =>
                        setEditForm((s) => ({
                          ...s,
                          validation_type: e.target.value as ValidationType,
                        }))
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {VALIDATION_TYPES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editForm.approval_mode}
                      onChange={(e) =>
                        setEditForm((s) => ({
                          ...s,
                          approval_mode: e.target.value as ApprovalMode,
                        }))
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {APPROVAL_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Header title"
                      value={editForm.header_title}
                      onChange={(e) =>
                        setEditForm((s) => ({ ...s, header_title: e.target.value }))
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <input
                      placeholder="Header image URL"
                      value={editForm.header_image_url}
                      onChange={(e) =>
                        setEditForm((s) => ({ ...s, header_image_url: e.target.value }))
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <input
                      placeholder="Target person name"
                      value={editForm.target_person_name}
                      onChange={(e) =>
                        setEditForm((s) => ({ ...s, target_person_name: e.target.value }))
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <input
                      placeholder="Submission hint"
                      value={editForm.submission_hint}
                      onChange={(e) =>
                        setEditForm((s) => ({ ...s, submission_hint: e.target.value }))
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <input
                      placeholder="Points per submission"
                      type="number"
                      min={0}
                      value={editForm.points_per_submission}
                      onChange={(e) =>
                        setEditForm((s) => ({
                          ...s,
                          points_per_submission: e.target.value,
                        }))
                      }
                      className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={editForm.add_to_greetings}
                        onChange={(e) =>
                          setEditForm((s) => ({
                            ...s,
                            add_to_greetings: e.target.checked,
                          }))
                        }
                      />
                      Add to greetings
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={editForm.allow_multiple_submissions}
                        onChange={(e) =>
                          setEditForm((s) => ({
                            ...s,
                            allow_multiple_submissions: e.target.checked,
                          }))
                        }
                      />
                      Multiple submissions
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) =>
                          setEditForm((s) => ({ ...s, is_active: e.target.checked }))
                        }
                      />
                      Active
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={editForm.message_required}
                        onChange={(e) =>
                          setEditForm((s) => ({ ...s, message_required: e.target.checked }))
                        }
                      />
                      Message required
                    </label>
                  </div>
                  <textarea
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((s) => ({ ...s, description: e.target.value }))
                    }
                    rows={2}
                    className="mt-2 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    type="button"
                    disabled={savingMissionId === m.id || !editForm.title.trim()}
                    onClick={() => saveEdit(m.id)}
                    className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {savingMissionId === m.id ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
