'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAdminScoreBreakdown,
  resetAdminAllScores,
  resetAdminScoresForTable,
  undoAdminScoreEvent,
  undoAdminScoreEvents,
  type TableScoreBreakdown,
  type ScoreEvent,
} from '@/lib/admin-scoreboard'

export default function ScoreboardAdminPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tables, setTables] = useState<TableScoreBreakdown[] | null>(null)
  const [undoingEventId, setUndoingEventId] = useState<string | null>(null) // kept for compatibility; not used for bulk
  const [resettingTableId, setResettingTableId] = useState<string | null>(null)
  const [resettingAll, setResettingAll] = useState(false)
  const [selectedEventKeys, setSelectedEventKeys] = useState<Set<string>>(
    () => new Set()
  )
  const [success, setSuccess] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const data = await fetchAdminScoreBreakdown()
      setTables(data)
      setSelectedEventKeys(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load score breakdown.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function eventKey(e: ScoreEvent): string {
    return `${e.kind}:${e.eventId}`
  }

  const selectedEvents: ScoreEvent[] = (() => {
    if (!tables) return []
    const keys = selectedEventKeys
    const out: ScoreEvent[] = []
    for (const t of tables) {
      for (const e of t.events) {
        if (keys.has(eventKey(e))) out.push(e)
      }
    }
    return out
  })()

  const allEventKeysCount = useMemo(() => {
    if (!tables) return 0
    let n = 0
    for (const t of tables) n += t.events.length
    return n
  }, [tables])

  async function handleBulkUndoSelected() {
    if (selectedEvents.length === 0) return

    const ok = window.confirm(
      `Undo ${selectedEvents.length} selected scoring event(s)?\n\nThis removes their score contribution while preserving submission history where applicable.`
    )
    if (!ok) return

    setUndoingEventId('bulk')
    setSuccess(null)
    setError(null)
    try {
      await undoAdminScoreEvents(selectedEvents)
      setSuccess('Selected events undone.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk undo failed.')
    } finally {
      setUndoingEventId(null)
    }
  }

  async function handleUndoSingle(event: ScoreEvent) {
    const ok = window.confirm(
      `Undo ${event.sourceLabel} for "${event.missionTitle}" on this table?\n\nThis removes the score contribution while preserving submission history where applicable.`
    )
    if (!ok) return

    setUndoingEventId(event.eventId)
    setSuccess(null)
    setError(null)
    try {
      await undoAdminScoreEvent(event)
      setSuccess('Undo complete.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Undo failed.')
    } finally {
      setUndoingEventId(null)
    }
  }

  async function handleResetTable(tableId: string) {
    const ok = window.confirm(
      `Reset all leaderboard scores for this table?\n\nThis will remove completions and revert approved mission submissions for this table (history preserved).`
    )
    if (!ok) return
    const typed = window.prompt('Type RESET to confirm table reset:')
    if ((typed ?? '').trim().toUpperCase() !== 'RESET') return

    setResettingTableId(tableId)
    setSuccess(null)
    setError(null)
    try {
      await resetAdminScoresForTable(tableId)
      setSuccess('Table scores reset.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Table reset failed.')
    } finally {
      setResettingTableId(null)
    }
  }

  async function handleResetAll() {
    const ok = window.confirm(
      'Reset ALL leaderboard scores globally?\n\nThis removes all completions and reverts all approved mission submissions (submission history preserved).'
    )
    if (!ok) return
    const typed = window.prompt('Type RESET to confirm GLOBAL reset:')
    if ((typed ?? '').trim().toUpperCase() !== 'RESET') return

    setResettingAll(true)
    setSuccess(null)
    setError(null)
    try {
      await resetAdminAllScores()
      setSuccess('Global scores reset.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Global reset failed.')
    } finally {
      setResettingAll(false)
    }
  }

  return (
    <div className="admin-page-shell space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Scoreboard breakdown
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Each entry is an undoable scoring unit. Use Undo for event-day corrections.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900">
            <input
              type="checkbox"
              checked={allEventKeysCount > 0 && selectedEventKeys.size === allEventKeysCount}
              onChange={(e) => {
                if (!tables) return
                const next = new Set<string>()
                if (e.target.checked) {
                  for (const t of tables) {
                    for (const ev of t.events) next.add(eventKey(ev))
                  }
                }
                setSelectedEventKeys(next)
              }}
            />
            Select all across page ({selectedEvents.length})
          </label>

          <button
            type="button"
            disabled={undoingEventId === 'bulk' || selectedEvents.length === 0}
            onClick={() => void handleBulkUndoSelected()}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {undoingEventId === 'bulk' ? 'Undoing…' : `Undo selected (${selectedEvents.length})`}
          </button>

          <button
            type="button"
            disabled={resettingAll || loading}
            onClick={() => void handleResetAll()}
            className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-40 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            {resettingAll ? 'Resetting…' : 'Reset all scores'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {success}
        </div>
      )}

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading breakdown…</p>
      )}

      {!loading && tables && tables.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No tables found.
        </p>
      )}

      {!loading && tables && tables.length > 0 && (
        <div className="space-y-5">
          {tables.map((t) => {
            const allKeysForTable = t.events.map((e) => eventKey(e))
            const selectedForTable = allKeysForTable.filter((k) =>
              selectedEventKeys.has(k)
            )
            const allSelectedForTable =
              allKeysForTable.length > 0 &&
              selectedForTable.length === allKeysForTable.length
            const someSelectedForTable =
              selectedForTable.length > 0 && !allSelectedForTable

            return (
              <section
                key={t.tableId}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 border border-white/20"
                        style={{
                          backgroundColor: t.tableColor || '#71717a',
                        }}
                        aria-hidden
                      />
                      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {t.tableName}
                      </h2>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Total: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{t.totalPoints}</span> pts
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={allSelectedForTable}
                        onChange={(e) => {
                          const next = new Set<string>(selectedEventKeys)
                          const shouldSelectAll = e.target.checked
                          if (shouldSelectAll) {
                            for (const k of allKeysForTable) next.add(k)
                          } else {
                            for (const k of allKeysForTable) next.delete(k)
                          }
                          setSelectedEventKeys(next)
                        }}
                        ref={(el) => {
                          if (!el) return
                          el.indeterminate = someSelectedForTable
                        }}
                        aria-label="Select all events for table"
                      />
                      Select all
                    </label>

                    <button
                      type="button"
                      disabled={resettingTableId === t.tableId || t.events.length === 0}
                      onClick={() => void handleResetTable(t.tableId)}
                      className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 disabled:opacity-40 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      {resettingTableId === t.tableId ? 'Resetting…' : 'Reset table'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  {t.events.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      No scoring events yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {t.events.map((e) => (
                        <div
                          key={`${e.kind}:${e.eventId}`}
                          className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/30"
                        >
                          <div className="shrink-0 pt-0.5">
                            <input
                              type="checkbox"
                              checked={selectedEventKeys.has(eventKey(e))}
                              onChange={(ev) => {
                                const next = new Set<string>(selectedEventKeys)
                                const k = eventKey(e)
                                if (ev.target.checked) next.add(k)
                                else next.delete(k)
                                setSelectedEventKeys(next)
                              }}
                              aria-label={`Select ${e.sourceLabel}`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                {e.missionTitle}
                              </span>
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                · {e.sourceLabel}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                              <span className="font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
                                +{e.points} pts
                              </span>
                              <span className="text-zinc-500 dark:text-zinc-400"> · </span>
                              <span className="text-zinc-500 dark:text-zinc-400">
                                {new Date(e.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={undoingEventId === e.eventId}
                            onClick={() => void handleUndoSingle(e)}
                            className="shrink-0 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
                          >
                            {undoingEventId === e.eventId ? 'Undoing…' : 'Undo'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

