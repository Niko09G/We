'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react'
import {
  listAttendeesForAdmin,
  updateAttendee,
  type AttendeeRow,
} from '@/lib/admin-attendees'
import { listAttendeeGroups, type AttendeeGroupRow } from '@/lib/admin-attendee-groups'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import { AdminFilterRowSegmented } from '@/app/admin/_components/AdminFilterRowSegmented'
import { AdminSelectDropdown } from '@/app/admin/_components/AdminSelectDropdown'
import {
  buildSeatingParties,
  partyKeysOnTableOrdered,
  planAssignPartyToTable,
  planDropPartyAtTablePosition,
  planReorderPartyInTable,
  planUnassignParty,
  type SeatingParty,
  type SeatingUpdate,
} from '@/lib/seating-planner'
import {
  AdminTableTwinSeatMap,
  PartyAvatarCluster,
  PartyMetaLine,
  seatRangeLabel,
} from '@/app/admin/seating/_components/seating-planner-shared'

type DockFilter = 'all' | 'unassigned' | 'assigned' | 'split'

const DND_PARTY_KEY = 'application/x-wedding-party-key'

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

function isPartyUnassignedForDock(p: SeatingParty): boolean {
  if (p.splitWarning) {
    const anySeated = p.members.some((m) => m.table_id != null)
    if (anySeated) return false
    return true
  }
  return p.uniformTableId == null
}

function tableSwatchStyle(color: string | null): CSSProperties {
  const c = color?.trim()
  if (c && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) {
    return { backgroundColor: c }
  }
  return { backgroundColor: '#d4d4d8' }
}

function RemoveFromTableButton({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label="Remove party from table"
      title="Remove from table"
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[18px] font-light leading-none text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-300"
    >
      ×
    </button>
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
  const [search, setSearch] = useState('')
  const [dockFilter, setDockFilter] = useState<DockFilter>('all')
  const [dragPartyKey, setDragPartyKey] = useState<string | null>(null)
  const [dropFlash, setDropFlash] = useState<string | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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

  const tableNameById = useMemo(
    () => new Map(plannerTables.map((t) => [t.id, t.name] as const)),
    [plannerTables]
  )

  const splitParties = useMemo(() => parties.filter((p) => p.splitWarning), [parties])

  const dockCounts = useMemo(
    () => ({
      all: parties.length,
      unassigned: parties.filter(isPartyUnassignedForDock).length,
      assigned: parties.filter((p) => !p.splitWarning && p.uniformTableId != null).length,
      split: parties.filter((p) => p.splitWarning).length,
    }),
    [parties]
  )

  const searchNeedle = search.trim().toLowerCase()

  const filteredDockParties = useMemo(() => {
    let list = parties
    if (dockFilter === 'unassigned') {
      list = parties.filter(isPartyUnassignedForDock)
    } else if (dockFilter === 'assigned') {
      list = parties.filter((p) => !p.splitWarning && p.uniformTableId != null)
    } else if (dockFilter === 'split') {
      list = parties.filter((p) => p.splitWarning)
    }

    if (searchNeedle) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(searchNeedle) ||
          p.members.some((m) => m.full_name.toLowerCase().includes(searchNeedle))
      )
    }

    return [...list].sort((a, b) => {
      const ua = isPartyUnassignedForDock(a) ? 0 : 1
      const ub = isPartyUnassignedForDock(b) ? 0 : 1
      if (ua !== ub) return ua - ub
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    })
  }, [parties, dockFilter, searchNeedle])

  function partiesOnTable(tableId: string): SeatingParty[] {
    const keys = partyKeysOnTableOrdered(rows, tableId)
    const byKey = new Map(parties.map((p) => [p.key, p]))
    return keys
      .map((k) => byKey.get(k))
      .filter((p): p is SeatingParty => Boolean(p))
  }

  function rowsAtTable(tableId: string): AttendeeRow[] {
    return rows.filter((r) => r.table_id === tableId)
  }

  const scrollTableIntoWorkspace = useCallback((tableId: string) => {
    const lane = laneRefs.current.get(tableId)
    const wrap = workspaceRef.current
    if (!lane || !wrap) return
    const laneLeft = lane.offsetLeft
    const laneWidth = lane.offsetWidth
    const target = laneLeft - (wrap.clientWidth - laneWidth) / 2
    wrap.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [])

  const focusPartyInWorkspace = useCallback(
    (p: SeatingParty) => {
      if (p.uniformTableId) {
        scrollTableIntoWorkspace(p.uniformTableId)
      }
    },
    [scrollTableIntoWorkspace]
  )

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

  const assignDropdownValue = (p: SeatingParty) =>
    p.uniformTableId ?? '__choose_table'

  const tablePickOptions = useMemo(
    () =>
      plannerTables.map((t) => ({
        value: t.id,
        label: t.name,
      })),
    [plannerTables]
  )

  function dockAssignOptionsForParty(p: SeatingParty): { value: string; label: string }[] {
    if (!p.uniformTableId) {
      return [{ value: '__choose_table', label: 'Assign to table…' }, ...tablePickOptions]
    }
    return [{ value: '__unassign', label: 'Remove from table' }, ...tablePickOptions]
  }

  const setLaneRef = (tableId: string) => (el: HTMLDivElement | null) => {
    if (el) laneRefs.current.set(tableId, el)
    else laneRefs.current.delete(tableId)
  }

  const readDragPartyKey = useCallback((e: DragEvent) => {
    return e.dataTransfer.getData(DND_PARTY_KEY) || e.dataTransfer.getData('text/plain')
  }, [])

  function handleDropOnTable(
    tableId: string,
    partyKey: string,
    insertBeforePartyKey: string | null
  ) {
    if (busy || loading) return
    const party = parties.find((p) => p.key === partyKey)
    if (!party || party.splitWarning) return
    if (insertBeforePartyKey === partyKey) return

    const cap = plannerTables.find((t) => t.id === tableId)?.capacity ?? 10
    const onThisTable = party.uniformTableId === tableId

    if (onThisTable) {
      void runPlan(
        () => planReorderPartyInTable(rows, tableId, partyKey, insertBeforePartyKey),
        'Order updated.'
      )
    } else {
      void runPlan(
        () =>
          planDropPartyAtTablePosition(rows, partyKey, tableId, cap, insertBeforePartyKey),
        insertBeforePartyKey ? 'Party placed.' : 'Party assigned.'
      )
    }
  }

  const startPartyDrag = useCallback(
    (e: DragEvent, partyKey: string, canDrag: boolean) => {
      if (!canDrag || busy) {
        e.preventDefault()
        return
      }
      e.dataTransfer.setData(DND_PARTY_KEY, partyKey)
      e.dataTransfer.setData('text/plain', partyKey)
      e.dataTransfer.effectAllowed = 'move'
      setDragPartyKey(partyKey)
    },
    [busy]
  )

  const endPartyDrag = useCallback(() => {
    setDragPartyKey(null)
  }, [])

  return (
    <div className="admin-page-shell flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <p className="sr-only" aria-live="polite">
        {error ?? ''} {success ?? ''}
      </p>

      <header className="shrink-0">
        <h1 className="admin-page-title text-zinc-900">Seating</h1>
        <p className="admin-gap-page-title-intro admin-intro">
          Plan seating by party: assign tables, reorder rows, and keep seat blocks contiguous. Guest
          seat maps will follow these assignments later.
        </p>
      </header>

      {error ? (
        <p className="admin-gap-page-title-intro mt-2 shrink-0 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="admin-gap-page-title-intro mt-2 shrink-0 text-sm font-medium text-emerald-700"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <section className="admin-gap-intro-first-section flex min-h-0 flex-1 flex-row overflow-hidden rounded-t-2xl border-x border-t border-[#ebebeb] bg-white">
        {loading ? (
          <p className="shrink-0 px-4 py-6 text-sm text-zinc-500">Loading…</p>
        ) : plannerTables.length === 0 ? (
          <p className="shrink-0 px-4 py-6 text-sm text-zinc-500">
            No active tables. Add tables under Overview → Tables (mark active, not archived).
          </p>
        ) : (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div
                ref={workspaceRef}
                className="admin-scroll-area min-h-0 flex-1 overflow-x-auto overflow-y-auto"
              >
                <div className="min-h-full min-w-min p-4 pb-6">
                  {splitParties.length > 0 ? (
                    <div
                      className="mb-4 max-w-[min(56rem,calc(100vw-24rem))] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
                      role="status"
                    >
                      <p className="font-semibold">
                        {splitParties.length}{' '}
                        {splitParties.length === 1 ? 'party has' : 'parties have'} split seat assignments
                      </p>
                      <p className="mt-1 text-[12px] text-amber-900/90">
                        Members are not all on the same table. Resolve on the Attendees page, or unassign
                        and reseat here. Split parties cannot be drag-moved until fixed.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex gap-5 pr-2">
                    {plannerTables.map((t) => {
                      const used = rowsAtTable(t.id).length
                      const cap = t.capacity
                      const remaining = Math.max(0, cap - used)
                      const list = partiesOnTable(t.id)
                      const laneFlash = dropFlash === t.id
                      return (
                        <div
                          key={t.id}
                          ref={setLaneRef(t.id)}
                          data-table-lane={t.id}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            const key = readDragPartyKey(e)
                            if (!key) return
                            handleDropOnTable(t.id, key, null)
                            setDropFlash(t.id)
                            window.setTimeout(
                              () => setDropFlash((c: string | null) => (c === t.id ? null : c)),
                              350
                            )
                          }}
                          className={`flex w-[min(100vw-2rem,420px)] shrink-0 flex-col rounded-2xl border border-[#ebebeb] bg-white shadow-none transition-[box-shadow,ring] duration-200 ease-out hover:shadow-md ${
                            laneFlash ? 'ring-2 ring-[#5b38f2]/35' : ''
                          }`}
                        >
                          <div className="border-b border-[#ebebeb] px-3 py-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                <div
                                  className="h-9 w-9 shrink-0 rounded-full border border-[#ebebeb] shadow-sm"
                                  style={tableSwatchStyle(t.color)}
                                  aria-hidden
                                />
                                <div className="min-w-0">
                                  <h2 className="truncate text-[14px] font-semibold text-zinc-900">
                                    {t.name}
                                  </h2>
                                  <p className="mt-0.5 text-[11px] font-medium tabular-nums text-zinc-500">
                                    Cap {cap} · {used} used · {remaining} left
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3">
                              <AdminTableTwinSeatMap
                                capacity={cap}
                                attendeesAtTable={rowsAtTable(t.id)}
                              />
                            </div>
                          </div>

                          <div className="flex min-h-[200px] flex-1 flex-col gap-1.5 px-2 py-2">
                            {list.length === 0 ? (
                              <p className="px-1 py-6 text-center text-[13px] text-zinc-500">
                                Drag a party here, or assign from the Parties panel.
                              </p>
                            ) : (
                              list.map((p) => {
                                const rowDraggable = !busy && !p.splitWarning
                                return (
                                  <div
                                    key={p.key}
                                    data-party-key={p.key}
                                    draggable={rowDraggable}
                                    onDragStart={(e) => startPartyDrag(e, p.key, rowDraggable)}
                                    onDragEnd={endPartyDrag}
                                    onDragOver={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      e.dataTransfer.dropEffect = 'move'
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      const key = readDragPartyKey(e)
                                      if (!key) return
                                      handleDropOnTable(t.id, key, p.key)
                                    }}
                                    className={`rounded-xl border px-2 py-2 transition-[opacity,border-color] ${
                                      p.splitWarning
                                        ? 'border-amber-300 bg-amber-50/80'
                                        : 'border-[#ebebeb] bg-[#fafafa]'
                                    } ${dragPartyKey === p.key ? 'opacity-55' : ''} ${
                                      rowDraggable ? 'cursor-grab active:cursor-grabbing' : ''
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <PartyAvatarCluster members={p.members} size="sm" />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="truncate text-[13px] font-semibold text-zinc-900">
                                            {p.title}
                                          </span>
                                          {p.splitWarning ? (
                                            <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                              Split
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className="mt-0.5 text-[11px] font-medium tabular-nums text-zinc-600">
                                          Seats {seatRangeLabel(p)}
                                        </p>
                                      </div>
                                      <RemoveFromTableButton
                                        disabled={busy}
                                        onClick={() =>
                                          void runPlan(
                                            () => planUnassignParty(rows, p.key),
                                            'Party removed from table.'
                                          )
                                        }
                                      />
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <aside
              className="flex w-[min(100%,400px)] shrink-0 flex-col border-l border-[#ebebeb] bg-white shadow-[-8px_0_24px_-20px_rgba(0,0,0,0.12)]"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const key = readDragPartyKey(e)
                if (!key) return
                void runPlan(() => planUnassignParty(rows, key), 'Party removed from table.')
              }}
            >
              <div className="shrink-0 space-y-3 border-b border-[#ebebeb] px-4 py-3">
                <div>
                  <h2 className="text-[13px] font-semibold text-zinc-900">Parties</h2>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                    Search matches guest names; rows stay grouped as parties. Drag onto a table or use
                    Assign. Use the dashed zone below to unseat. Unassigned sort first.
                  </p>
                </div>
                <div className="relative">
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
                    placeholder="Search parties or guests…"
                    className="h-10 w-full rounded-full border border-[#ebebeb] bg-white pl-8 pr-[12px] text-[14px] font-normal text-[#171717] placeholder:text-[14px] placeholder:text-[#767676] outline-none transition-colors duration-150 ease-out focus:border-zinc-400"
                  />
                </div>
                <AdminFilterRowSegmented<DockFilter>
                  ariaLabel="Party list filters"
                  value={dockFilter}
                  onChange={setDockFilter}
                  className="max-w-full flex-wrap"
                  options={(
                    [
                      ['all', 'All', dockCounts.all],
                      ['unassigned', 'Unassigned', dockCounts.unassigned],
                      ['assigned', 'Assigned', dockCounts.assigned],
                      ['split', 'Split', dockCounts.split],
                    ] as const
                  ).map(([id, label, n]) => ({
                    value: id,
                    label: (
                      <>
                        {label}
                        <span className="tabular-nums opacity-90">
                          {' ('}
                          {n}
                          {')'}
                        </span>
                      </>
                    ),
                  }))}
                />
                <div
                  className="rounded-lg border border-dashed border-[#dcdcdc] bg-[#f9fafb] px-3 py-2.5 text-center text-[11px] font-medium text-zinc-600"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const key = readDragPartyKey(e)
                    if (!key) return
                    void runPlan(
                      () => planUnassignParty(rows, key),
                      'Party removed from table.'
                    )
                  }}
                >
                  Drop on this zone to unseat from table
                </div>
              </div>
              <div className="admin-scroll-area min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <ul className="space-y-2">
                  {filteredDockParties.map((p) => {
                    const assignedTable =
                      p.uniformTableId != null ? tableNameById.get(p.uniformTableId) : null
                    const matchesSearch =
                      Boolean(searchNeedle) &&
                      (p.title.toLowerCase().includes(searchNeedle) ||
                        p.members.some((m) =>
                          m.full_name.toLowerCase().includes(searchNeedle)
                        ))
                    const dockDraggable = !busy && !p.splitWarning
                    return (
                      <li key={p.key}>
                        <div
                          data-party-key={p.key}
                          draggable={dockDraggable}
                          onDragStart={(e) => startPartyDrag(e, p.key, dockDraggable)}
                          onDragEnd={endPartyDrag}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            e.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={(e) => e.stopPropagation()}
                          className={`rounded-xl border border-[#ebebeb] bg-[#fafafa] px-2.5 py-2 transition-[box-shadow,border-color,opacity] ${
                            matchesSearch ? 'border-[#5b38f2]/40 ring-2 ring-[#5b38f2]/25' : ''
                          } ${dragPartyKey === p.key ? 'opacity-55' : ''} ${
                            dockDraggable ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <PartyAvatarCluster members={p.members} size="sm" />
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => focusPartyInWorkspace(p)}
                                disabled={!p.uniformTableId}
                                className="block w-full cursor-pointer text-left disabled:cursor-default disabled:opacity-60"
                              >
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate text-[13px] font-semibold text-zinc-900">
                                    {p.title}
                                  </span>
                                  {p.splitWarning ? (
                                    <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                      Split
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-0.5 text-[11px] text-zinc-600">
                                  <PartyMetaLine party={p} />
                                  {assignedTable ? (
                                    <>
                                      <span className="text-zinc-400"> · </span>
                                      <span className="font-medium text-zinc-700">{assignedTable}</span>
                                      {p.minSeat != null && p.maxSeat != null ? (
                                        <>
                                          <span className="text-zinc-400"> · </span>
                                          <span className="tabular-nums">
                                            Seats {seatRangeLabel(p)}
                                          </span>
                                        </>
                                      ) : null}
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-zinc-400"> · </span>
                                      <span className="font-medium text-amber-800/90">Not seated</span>
                                    </>
                                  )}
                                </p>
                              </button>
                              <div className={`mt-2 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                                {p.splitWarning ? (
                                  <div className="flex h-9 items-center rounded-full border border-amber-200 bg-amber-50/80 px-3 text-[12px] font-semibold text-amber-900">
                                    Fix split on Attendees first
                                  </div>
                                ) : (
                                  <AdminSelectDropdown<string>
                                    value={assignDropdownValue(p)}
                                    onChange={(v) => {
                                      if (v === '__choose_table') return
                                      if (v === '__unassign') {
                                        void runPlan(
                                          () => planUnassignParty(rows, p.key),
                                          'Party removed from table.'
                                        )
                                        return
                                      }
                                      void runPlan(
                                        () =>
                                          planAssignPartyToTable(
                                            rows,
                                            p.key,
                                            v,
                                            plannerTables.find((x) => x.id === v)?.capacity ?? 10
                                          ),
                                        p.uniformTableId ? 'Party moved.' : 'Party assigned.'
                                      )
                                    }}
                                    className="w-full min-w-0"
                                    buttonClassName="inline-flex h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-full border border-[#ebebeb] bg-white px-3 pr-2 text-left text-[12px] font-semibold text-zinc-800 outline-none hover:border-zinc-300"
                                    options={dockAssignOptionsForParty(p)}
                                    renderValue={() => {
                                      if (p.uniformTableId) {
                                        return (
                                          <span className="truncate">
                                            {tableNameById.get(p.uniformTableId) ?? 'Table'}
                                          </span>
                                        )
                                      }
                                      return <span className="text-zinc-500">Assign to table…</span>
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {filteredDockParties.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-zinc-500">No parties match.</p>
                ) : null}
              </div>
            </aside>
          </>
        )}
      </section>
    </div>
  )
}
