'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  listAttendeesForAdmin,
  updateAttendee,
  type AttendeeRow,
} from '@/lib/admin-attendees'
import { listAttendeeGroups, type AttendeeGroupRow } from '@/lib/admin-attendee-groups'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import {
  buildSeatingParties,
  computePartyExtraGuestsCount,
  computePartyKidsCount,
  partyKeysOnTableOrdered,
  planAssignPartyToTable,
  planMovePartyOnTable,
  planUnassignParty,
  type SeatingParty,
  type SeatingUpdate,
} from '@/lib/seating-planner'

function seatRangeLabel(p: SeatingParty): string {
  if (p.minSeat == null || p.maxSeat == null) return '—'
  if (p.minSeat === p.maxSeat) return String(p.minSeat)
  return `${p.minSeat}–${p.maxSeat}`
}

async function applySeatingUpdates(updates: SeatingUpdate[]): Promise<void> {
  await Promise.all(
    updates.map((u) =>
      updateAttendee(u.id, {
        table_id: u.table_id,
        seat_number: u.seat_number,
      })
    )
  )
}

function PartyBlock({
  party,
  children,
}: {
  party: SeatingParty
  children?: ReactNode
}) {
  const kids = computePartyKidsCount(party.members)
  const extras = computePartyExtraGuestsCount(party.members)
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/80">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
            {party.title}
            {party.splitWarning ? (
              <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                Split seats
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>{party.members.length} seats</span>
            <span>{kids} kids</span>
            <span>{extras} extra</span>
            <span className="text-zinc-600 dark:text-zinc-300">
              Seats {seatRangeLabel(party)}
            </span>
          </div>
        </div>
        {children ? <div className="flex shrink-0 flex-wrap items-center gap-1">{children}</div> : null}
      </div>
    </div>
  )
}

export default function AdminSeatingPage() {
  const [rows, setRows] = useState<AttendeeRow[]>([])
  const [groups, setGroups] = useState<AttendeeGroupRow[]>([])
  const [tables, setTables] = useState<AdminTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [r, g, t] = await Promise.all([
        listAttendeesForAdmin(),
        listAttendeeGroups(),
        listTablesForAdmin(),
      ])
      setRows(r)
      setGroups(g)
      setTables(t)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to load seating data. If this mentions a missing column, run the SQL migration for tables.capacity in Supabase.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const parties = useMemo(
    () => buildSeatingParties(rows, groups),
    [rows, groups]
  )

  const plannerTables = useMemo(
    () => tables.filter((t) => !t.is_archived && t.is_active),
    [tables]
  )

  const unassignedParties = useMemo(() => {
    return parties.filter((p) => {
      if (p.splitWarning) {
        const anySeated = p.members.some((m) => m.table_id != null)
        if (anySeated) return false
        return true
      }
      return p.uniformTableId == null
    })
  }, [parties])

  function partiesOnTable(tableId: string): SeatingParty[] {
    const keys = partyKeysOnTableOrdered(rows, tableId)
    const byKey = new Map(parties.map((p) => [p.key, p]))
    return keys
      .map((k) => byKey.get(k))
      .filter((p): p is SeatingParty => Boolean(p))
  }

  async function runPlan(
    build: () => { updates: SeatingUpdate[]; error?: string },
    okMessage: string
  ) {
    setError(null)
    setSuccess(null)
    const { updates, error: planError } = build()
    if (planError) {
      setError(planError)
      return
    }
    if (updates.length === 0) {
      setSuccess('No changes.')
      return
    }
    setBusy(true)
    try {
      await applySeatingUpdates(updates)
      setSuccess(okMessage)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save seating.')
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Seating planner
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Assign whole parties to tables. Seats are numbered 1…N per table and stay
            contiguous within each party.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void loadAll()}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400" role="status">
          {success}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="mt-6 space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Unassigned parties
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {unassignedParties.length === 0
                ? 'Everyone is assigned to a table (or fix split parties on Attendees).'
                : 'Assign a table — all members move together; seats fill from the next free numbers.'}
            </p>
            {unassignedParties.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-500">None.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {unassignedParties.map((p) => (
                  <li key={p.key}>
                    <PartyBlock party={p}>
                      <select
                        disabled={busy || p.splitWarning}
                        value=""
                        onChange={(e) => {
                          const tid = e.target.value
                          e.target.value = ''
                          if (!tid) return
                          void runPlan(
                            () =>
                              planAssignPartyToTable(
                                rows,
                                p.key,
                                tid,
                                plannerTables.find((t) => t.id === tid)?.capacity ?? 10
                              ),
                            'Party assigned.'
                          )
                        }}
                        className="max-w-[11rem] cursor-pointer rounded-full border border-zinc-200 bg-white py-1 pl-2.5 pr-7 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                      >
                        <option value="">Assign to table…</option>
                        {plannerTables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </PartyBlock>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {plannerTables.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No active tables. Add tables under Overview → Tables (mark active, not archived).
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {plannerTables.map((t) => {
                const used = rows.filter((r) => r.table_id === t.id).length
                const cap = t.capacity
                const remaining = Math.max(0, cap - used)
                const list = partiesOnTable(t.id)
                return (
                  <section
                    key={t.id}
                    className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800">
                      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {t.name}
                      </h2>
                      <p className="text-[11px] text-zinc-500">
                        Capacity {cap} · {used} used · {remaining} left
                      </p>
                    </div>
                    {list.length === 0 ? (
                      <p className="mt-3 text-xs text-zinc-500">No parties yet.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {list.map((p) => (
                          <li key={p.key}>
                            <PartyBlock party={p}>
                              <button
                                type="button"
                                disabled={busy || p.splitWarning}
                                onClick={() =>
                                  void runPlan(
                                    () => planMovePartyOnTable(rows, t.id, p.key, 'up'),
                                    'Order updated.'
                                  )
                                }
                                className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                disabled={busy || p.splitWarning}
                                onClick={() =>
                                  void runPlan(
                                    () => planMovePartyOnTable(rows, t.id, p.key, 'down'),
                                    'Order updated.'
                                  )
                                }
                                className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                Down
                              </button>
                              <select
                                disabled={busy}
                                value=""
                                onChange={(e) => {
                                  const v = e.target.value
                                  e.target.value = ''
                                  if (v === '__unassign') {
                                    void runPlan(
                                      () => planUnassignParty(rows, p.key),
                                      'Party unassigned.'
                                    )
                                    return
                                  }
                                  if (!v) return
                                  void runPlan(
                                    () =>
                                      planAssignPartyToTable(
                                        rows,
                                        p.key,
                                        v,
                                        plannerTables.find((x) => x.id === v)?.capacity ?? 10
                                      ),
                                    'Party moved.'
                                  )
                                }}
                                className="max-w-[10rem] cursor-pointer rounded-full border border-zinc-200 bg-zinc-50 py-1 pl-2.5 pr-6 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                              >
                                <option value="">Move…</option>
                                <option value="__unassign">Unassign</option>
                                {!p.splitWarning
                                  ? plannerTables
                                      .filter((x) => x.id !== t.id)
                                      .map((x) => (
                                        <option key={x.id} value={x.id}>
                                          To {x.name}
                                        </option>
                                      ))
                                  : null}
                              </select>
                            </PartyBlock>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
