'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMissions, type MissionRecord } from '@/lib/admin-missions'
import {
  listActiveMissionAssignmentsForAdmin,
  setMissionAssignmentsForMission,
} from '@/lib/admin-mission-assignments'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import { missionTypeIcon } from '@/app/admin/missions/_components/mission-admin-shared'

export default function MissionBoardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [missions, setMissions] = useState<MissionRecord[]>([])
  const [tables, setTables] = useState<AdminTableRow[]>([])
  const [assignmentsByMission, setAssignmentsByMission] = useState<Record<string, string[]>>({})
  const [assigningKey, setAssigningKey] = useState<string | null>(null)
  const [addPickerTableId, setAddPickerTableId] = useState<string | null>(null)

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
      setError(e instanceof Error ? e.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
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

  async function handleAddMission(tableId: string, missionId: string) {
    const current = assignedMissionIdsForTable(tableId)
    if (current.includes(missionId)) return
    await setAssignmentForTable(tableId, [...current, missionId])
    setAddPickerTableId(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-zinc-950 md:px-6">
        <p className="text-sm text-zinc-500">Loading board…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 dark:bg-zinc-950 md:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header>
          <Link
            href="/admin/missions"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Mission library
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Table mission board
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            One column per table — add or remove missions quickly. Edit a mission’s details from the
            library.
          </p>
        </header>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            {success}
          </p>
        ) : null}

        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {activeTables.length === 0 ? (
            <p className="text-sm text-zinc-500">No active tables available.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-4 pb-2">
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
                      className="w-72 shrink-0 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/40"
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
                          className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-900"
                          style={{ backgroundColor: table.color ?? '#71717a' }}
                          aria-hidden
                        />
                      </div>
                      <div className="mt-3 min-h-[80px] space-y-2">
                        {assignedMissions.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-zinc-300 px-2 py-3 text-center text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                            No missions
                          </div>
                        ) : (
                          assignedMissions.map((m) => {
                            const busy = assigningKey === `${table.id}:${m.id}`
                            return (
                              <div
                                key={m.id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                              >
                                <div className="min-w-0 flex items-center gap-1.5">
                                  <span aria-hidden>{missionTypeIcon(m.validation_type)}</span>
                                  <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                                    {m.title}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void setAssignmentForTable(
                                      table.id,
                                      assignedIds.filter((id) => id !== m.id)
                                    )
                                  }
                                  className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
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
                                void handleAddMission(table.id, missionId)
                              }}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            >
                              <option value="">Select mission…</option>
                              {availableToAdd.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.title}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setAddPickerTableId(null)}
                              className="text-[11px] text-zinc-500 underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={availableToAdd.length === 0}
                            onClick={() => setAddPickerTableId(table.id)}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
      </div>
    </div>
  )
}
