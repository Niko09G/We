'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from 'react'
import {
  listAttendeesForAdmin,
  updateAttendee,
  type AttendeeRow,
} from '@/lib/admin-attendees'
import { listAttendeeGroups, type AttendeeGroupRow } from '@/lib/admin-attendee-groups'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import { AdminFilterRowSegmented } from '@/app/admin/_components/AdminFilterRowSegmented'
import {
  buildSeatingParties,
  partyKeysOnTableOrdered,
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
  avatarMembersForPartyStrip,
  seatRangeLabel,
} from '@/app/admin/seating/_components/seating-planner-shared'
import { teamPageAdminFormDefaults } from '@/lib/team-page-config'

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

function attendeeSeatContextLine(
  a: AttendeeRow,
  tableNameById: Map<string, string>,
  thisTableId: string,
  thisTableName: string
): string {
  if (!a.table_id) return 'Unassigned'
  const t = tableNameById.get(a.table_id) ?? 'Table'
  if (a.table_id !== thisTableId) {
    if (a.seat_number != null && Number.isFinite(a.seat_number)) {
      return `${t} – Seat ${Math.trunc(a.seat_number)}`
    }
    return `${t} – no seat yet`
  }
  if (a.seat_number == null || !Number.isFinite(a.seat_number)) {
    return `${thisTableName} – no seat yet`
  }
  return `${thisTableName} – Seat ${Math.trunc(a.seat_number)}`
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

type SeatPanelState = {
  seatNum: number
  occupant: AttendeeRow | null
  mode: 'view' | 'assign'
}

function LargeSeatingOverlay({
  table,
  rows,
  parties,
  tableNameById,
  highlightPartyKey,
  previewSeatRange,
  previewGhostMembers,
  dragPartyKey,
  busy,
  readDragPartyKey,
  handleDropOnTable,
  setDragHoverTableId,
  setDragInsertBeforeKey,
  setSeatMapHoverTableId,
  setHoveredPartyKey,
  startPartyDrag,
  endPartyDrag,
  runPlan,
  reloadRows,
  showToast,
  onClose,
}: {
  table: AdminTableRow | null
  rows: AttendeeRow[]
  parties: SeatingParty[]
  tableNameById: Map<string, string>
  highlightPartyKey: string | null
  previewSeatRange: { minSeat: number; maxSeat: number } | null
  previewGhostMembers: AttendeeRow[] | null
  dragPartyKey: string | null
  busy: boolean
  readDragPartyKey: (e: DragEvent) => string
  handleDropOnTable: (tableId: string, partyKey: string, insertBeforePartyKey: string | null) => void
  setDragHoverTableId: (v: string | null) => void
  setDragInsertBeforeKey: (v: string | null) => void
  setSeatMapHoverTableId: (v: string | null) => void
  setHoveredPartyKey: (v: string | null) => void
  startPartyDrag: (e: DragEvent, partyKey: string, canDrag: boolean) => void
  endPartyDrag: () => void
  runPlan: (
    build: () => { updates: SeatingUpdate[]; error?: string },
    okMessage: string
  ) => Promise<void>
  reloadRows: () => Promise<void>
  showToast: (message: string, kind: 'success' | 'error') => void
  onClose: () => void
}) {
  const tableId = table?.id ?? null

  const [seatPanel, setSeatPanel] = useState<SeatPanelState | null>(null)
  const [assignSearch, setAssignSearch] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [lockedSeats, setLockedSeats] = useState<Set<number>>(new Set())

  useEffect(() => {
    setLockedSeats(new Set())
    setSeatPanel(null)
    setAssignSearch('')
  }, [tableId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (seatPanel) {
        setSeatPanel(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, seatPanel])

  const tableRows = useMemo(
    () => (tableId ? rows.filter((r) => r.table_id === tableId) : []),
    [rows, tableId]
  )

  const list = useMemo(() => {
    if (!tableId || !table) return []
    const keys = partyKeysOnTableOrdered(rows, tableId)
    const byKey = new Map(parties.map((p) => [p.key, p]))
    return keys.map((k) => byKey.get(k)).filter((p): p is SeatingParty => Boolean(p))
  }, [table, tableId, rows, parties])

  const fromThisTableUnseated = useMemo(
    () =>
      [...tableRows]
        .filter((r) => r.seat_number == null)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })),
    [tableRows]
  )

  const assignNeedle = assignSearch.trim().toLowerCase()
  const allAttendeesFiltered = useMemo(() => {
    const base = [...rows].sort((a, b) =>
      a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
    )
    if (!assignNeedle) return base
    return base.filter(
      (r) =>
        r.full_name.toLowerCase().includes(assignNeedle) ||
        (r.email ?? '').toLowerCase().includes(assignNeedle)
    )
  }, [rows, assignNeedle])

  const assignGuestToSeat = useCallback(
    async (attendeeId: string, seatNum: number) => {
      if (!table) return
      if (lockedSeats.has(seatNum)) {
        showToast('This seat is locked.', 'error')
        return
      }
      setAssignBusy(true)
      try {
        const bySeatNow = new Map<number, AttendeeRow>()
        for (const r of tableRows) {
          if (typeof r.seat_number === 'number' && Number.isFinite(r.seat_number)) {
            const sn = Math.trunc(r.seat_number)
            if (sn >= 1 && sn <= table.capacity) bySeatNow.set(sn, r)
          }
        }
        const existing = bySeatNow.get(seatNum)
        if (existing && existing.id !== attendeeId) {
          await updateAttendee(existing.id, { seat_number: null })
        }
        const guest = rows.find((r) => r.id === attendeeId)
        const crossTable = guest?.table_id !== table.id
        await updateAttendee(attendeeId, {
          table_id: table.id,
          seat_number: seatNum,
        })
        await reloadRows()
        showToast(crossTable ? 'Guest moved to this table.' : 'Seat assigned.', 'success')
        setSeatPanel(null)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Assignment failed.', 'error')
      } finally {
        setAssignBusy(false)
      }
    },
    [table, tableRows, rows, lockedSeats, showToast, reloadRows]
  )

  const removeOccupantFromSeat = useCallback(
    async (attendeeId: string) => {
      setAssignBusy(true)
      try {
        await updateAttendee(attendeeId, { seat_number: null })
        await reloadRows()
        showToast('Removed from seat.', 'success')
        setSeatPanel(null)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to clear seat.', 'error')
      } finally {
        setAssignBusy(false)
      }
    },
    [reloadRows, showToast]
  )

  if (!table) return null

  const seatLocked = seatPanel ? lockedSeats.has(seatPanel.seatNum) : false

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex h-[min(92vh,820px)] w-[min(1120px,96vw)] flex-col overflow-hidden rounded-2xl border border-[#ebebeb] bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="large-seating-title"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ebebeb] px-4 py-3">
          <div className="min-w-0 pr-3">
            <h3 id="large-seating-title" className="truncate text-[16px] font-semibold text-zinc-900">
              {table.name} seating map
            </h3>
            <p className="text-[12px] text-zinc-500">Click a seat to assign precisely. Drag parties still works.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white"
            aria-label="Close large seating view"
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          <div
            className="relative shrink-0 rounded-xl border border-[#ebebeb] p-4"
            onDragOver={(e) => {
              if (!dragPartyKey) return
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              setSeatMapHoverTableId(table.id)
              setDragHoverTableId(table.id)
              setDragInsertBeforeKey(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const key = readDragPartyKey(e)
              if (!key) return
              handleDropOnTable(table.id, key, null)
            }}
          >
            <AdminTableTwinSeatMap
              capacity={table.capacity}
              attendeesAtTable={tableRows}
              partiesOnTable={list}
              highlightPartyKey={highlightPartyKey}
              previewSeatRange={previewSeatRange}
              previewGhostMembers={previewGhostMembers}
              size="large"
              showSeatNames
              lockedSeatNums={lockedSeats}
              onSeatClick={(seatNum, guest) => {
                setAssignSearch('')
                setSeatPanel({
                  seatNum,
                  occupant: guest,
                  mode: guest ? 'view' : 'assign',
                })
              }}
            />

            {seatPanel ? (
              <div className="absolute right-3 top-3 z-20 w-[min(100%,300px)] rounded-xl border border-[#ebebeb] bg-white p-3 shadow-lg">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Seat {seatPanel.seatNum}
                    </p>
                    {seatPanel.mode === 'view' && seatPanel.occupant ? (
                      <p className="mt-1 truncate text-[13px] font-semibold text-zinc-900">
                        {seatPanel.occupant.full_name}
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] font-semibold text-zinc-900">Assign guest</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSeatPanel(null)}
                    className="shrink-0 cursor-pointer text-[18px] font-light leading-none text-zinc-400 hover:text-zinc-700"
                    aria-label="Close seat panel"
                  >
                    ×
                  </button>
                </div>

                {seatPanel.mode === 'view' && seatPanel.occupant ? (
                  <div className="space-y-2 border-t border-zinc-100 pt-2">
                    <p className="text-[11px] text-zinc-600">
                      {attendeeSeatContextLine(
                        seatPanel.occupant,
                        tableNameById,
                        table.id,
                        table.name
                      )}
                    </p>
                    {seatLocked ? (
                      <p className="text-[11px] font-medium text-amber-800">Seat is locked.</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={assignBusy || seatLocked}
                        onClick={() =>
                          setSeatPanel({
                            seatNum: seatPanel.seatNum,
                            occupant: seatPanel.occupant,
                            mode: 'assign',
                          })
                        }
                        className="cursor-pointer rounded-full border border-[#ebebeb] bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        disabled={assignBusy || seatLocked}
                        onClick={() => void removeOccupantFromSeat(seatPanel.occupant!.id)}
                        className="cursor-pointer rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:pointer-events-none disabled:opacity-40"
                      >
                        Remove from seat
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const sn = seatPanel.seatNum
                          const willLock = !lockedSeats.has(sn)
                          setLockedSeats((prev) => {
                            const next = new Set(prev)
                            if (willLock) next.add(sn)
                            else next.delete(sn)
                            return next
                          })
                          showToast(
                            willLock ? 'Seat locked (this session).' : 'Seat unlocked (this session).',
                            'success'
                          )
                        }}
                        className="cursor-pointer rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100"
                      >
                        {seatLocked ? 'Unlock seat' : 'Lock seat'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[min(52vh,380px)] space-y-3 overflow-y-auto border-t border-zinc-100 pt-2">
                    {seatLocked ? (
                      <p className="text-[11px] font-medium text-amber-800">Unlock seat to assign.</p>
                    ) : null}
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        From this table
                      </p>
                      {fromThisTableUnseated.length === 0 ? (
                        <p className="text-[11px] text-zinc-500">Everyone here has a seat number.</p>
                      ) : (
                        <ul className="space-y-1">
                          {fromThisTableUnseated.map((a) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                disabled={assignBusy || seatLocked}
                                onClick={() =>
                                  void assignGuestToSeat(a.id, seatPanel.seatNum)
                                }
                                className="flex w-full cursor-pointer flex-col rounded-lg border border-[#ebebeb] bg-[#fafafa] px-2 py-1.5 text-left hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40"
                              >
                                <span className="truncate text-[12px] font-medium text-zinc-900">
                                  {a.full_name}
                                </span>
                                <span className="text-[10px] text-zinc-500">
                                  {table.name} – no seat yet
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        All attendees
                      </p>
                      <input
                        value={assignSearch}
                        onChange={(e) => setAssignSearch(e.target.value)}
                        placeholder="Search…"
                        className="mb-2 h-8 w-full rounded-lg border border-[#ebebeb] px-2 text-[12px] outline-none focus:border-zinc-400"
                      />
                      <ul className="space-y-1">
                        {allAttendeesFiltered.slice(0, 80).map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              disabled={assignBusy || seatLocked}
                              onClick={() =>
                                void assignGuestToSeat(a.id, seatPanel.seatNum)
                              }
                              className="flex w-full cursor-pointer flex-col rounded-lg border border-[#ebebeb] bg-white px-2 py-1.5 text-left hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40"
                            >
                              <span className="truncate text-[12px] font-medium text-zinc-900">
                                {a.full_name}
                              </span>
                              <span className="truncate text-[10px] text-zinc-500">
                                {attendeeSeatContextLine(a, tableNameById, table.id, table.name)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {allAttendeesFiltered.length > 80 ? (
                        <p className="mt-1 text-[10px] text-zinc-400">Refine search to see more.</p>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="admin-scroll-area min-h-0 flex-1 overflow-y-auto rounded-xl border border-[#ebebeb] p-3">
            <div className="grid grid-cols-5 gap-2">
              {list.map((p) => {
                const rowDraggable = !busy && !p.splitWarning
                return (
                  <div
                    key={p.key}
                    draggable={rowDraggable}
                    onDragStart={(e) => startPartyDrag(e, p.key, rowDraggable)}
                    onDragEnd={endPartyDrag}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (dragPartyKey) {
                        setDragHoverTableId(table.id)
                        setDragInsertBeforeKey(p.key)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const key = readDragPartyKey(e)
                      if (!key) return
                      handleDropOnTable(table.id, key, p.key)
                    }}
                    onMouseEnter={() => setHoveredPartyKey(p.key)}
                    onMouseLeave={() => setHoveredPartyKey(null)}
                    className={`flex min-w-0 flex-col gap-1 rounded-xl border px-2 py-2 ${p.splitWarning ? 'border-amber-300 bg-amber-50/80' : 'border-[#ebebeb] bg-[#fafafa]'} ${rowDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <PartyAvatarCluster members={p.members} size="sm" />
                      <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-zinc-900">
                        {p.title}
                      </p>
                    </div>
                    <p className="text-[10px] font-medium tabular-nums text-zinc-600">
                      {seatRangeLabel(p)}
                    </p>
                    <div className="mt-auto flex justify-end pt-0.5">
                      <RemoveFromTableButton
                        disabled={busy}
                        onClick={() =>
                          void runPlan(() => planUnassignParty(rows, p.key), 'Party removed from table.')
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
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
  const [toast, setToast] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const [search, setSearch] = useState('')
  const [dockFilter, setDockFilter] = useState<DockFilter>('all')
  const [dragPartyKey, setDragPartyKey] = useState<string | null>(null)
  const [dropFlash, setDropFlash] = useState<string | null>(null)
  const [dragHoverTableId, setDragHoverTableId] = useState<string | null>(null)
  const [dragInsertBeforeKey, setDragInsertBeforeKey] = useState<string | null>(null)
  const [seatMapHoverTableId, setSeatMapHoverTableId] = useState<string | null>(null)
  const [hoveredPartyKey, setHoveredPartyKey] = useState<string | null>(null)
  const [selectedPartyKey, setSelectedPartyKey] = useState<string | null>(null)
  const [dockCollapsed, setDockCollapsed] = useState(false)
  const [largeMapTableId, setLargeMapTableId] = useState<string | null>(null)
  const [scrubMetrics, setScrubMetrics] = useState({ cw: 0, sw: 0, sl: 0 })
  const workspaceRef = useRef<HTMLDivElement>(null)
  const scrubTrackRef = useRef<HTMLDivElement>(null)
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const showToast = useCallback(
    (message: string, kind: 'success' | 'error') => {
      setToast({ kind, message })
    },
    []
  )

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(t)
  }, [toast])

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
  const tableAvatarById = useMemo(
    () =>
      new Map(
        plannerTables.map((t) => {
          const d = teamPageAdminFormDefaults(t.page_config, {
            tableColor: t.color,
            tableName: t.name,
          })
          return [t.id, d.avatarImageUrl.trim()] as const
        })
      ),
    [plannerTables]
  )

  const tableGradientById = useMemo(
    () =>
      new Map(
        plannerTables.map((t) => {
          const d = teamPageAdminFormDefaults(t.page_config, {
            tableColor: t.color,
            tableName: t.name,
          })
          const top = d.tableGradTop.trim()
          const bottom = d.tableGradBottom.trim()
          return [t.id, `linear-gradient(145deg, ${top}, ${bottom})`] as const
        })
      ),
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
    const { updates, error: planError } = build()
    if (planError) {
      setError(null)
      showToast(planError, 'error')
      return
    }
    if (updates.length === 0) {
      showToast('No changes.', 'success')
      return
    }
    setBusy(true)
    try {
      await applySeatingUpdates(updates)
      showToast(okMessage, 'success')
      await loadAll()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save seating.'
      setError(null)
      showToast(msg, 'error')
      await loadAll()
    } finally {
      setBusy(false)
    }
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
        'Seating updated.'
      )
    } else {
      void runPlan(
        () =>
          planDropPartyAtTablePosition(rows, partyKey, tableId, cap, insertBeforePartyKey),
        'Seating updated.'
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
    setDragHoverTableId(null)
    setDragInsertBeforeKey(null)
    setSeatMapHoverTableId(null)
    setDropFlash(null)
  }, [])

  type SeatRange = { minSeat: number; maxSeat: number }

  const partyByKey = useMemo(() => new Map(parties.map((p) => [p.key, p])), [parties])

  const draggedParty = dragPartyKey ? partyByKey.get(dragPartyKey) ?? null : null

  const previewGhostMembers = useMemo(() => {
    if (!draggedParty) return null
    return avatarMembersForPartyStrip(draggedParty.members, 2)
  }, [draggedParty])

  const highlightPartyKey = hoveredPartyKey ?? selectedPartyKey ?? dragPartyKey

  const computePreviewSeatRangeForDrop = useCallback(
    (partyKey: string, tableId: string, insertBeforePartyKey: string | null): SeatRange | null => {
      const cap = plannerTables.find((t) => t.id === tableId)?.capacity ?? 10
      const dragged = partyByKey.get(partyKey)
      if (!dragged) return null

      const keysOnTable = partyKeysOnTableOrdered(rows, tableId)
      const keysWithoutDragged = keysOnTable.filter((k) => k !== partyKey)

      const safeInsert =
        insertBeforePartyKey && insertBeforePartyKey !== partyKey
          ? insertBeforePartyKey
          : null

      const nextKeys =
        safeInsert == null
          ? [...keysWithoutDragged, partyKey]
          : (() => {
              const idx = keysWithoutDragged.indexOf(safeInsert)
              if (idx < 0) return [...keysWithoutDragged, partyKey]
              const out = [...keysWithoutDragged]
              out.splice(idx, 0, partyKey)
              return out
            })()

      let seat = 1
      let minSeat: number | null = null
      let maxSeat: number | null = null
      for (const k of nextKeys) {
        const p = partyByKey.get(k)
        if (!p) continue
        if (k === partyKey) {
          minSeat = seat
          maxSeat = seat + p.members.length - 1
          break
        }
        seat += p.members.length
      }

      if (minSeat == null || maxSeat == null) return null
      if (maxSeat > cap) return null
      return { minSeat, maxSeat }
    },
    [plannerTables, rows, partyByKey]
  )

  const previewSeatRange = useMemo(() => {
    if (!dragPartyKey || !seatMapHoverTableId) return null
    return computePreviewSeatRangeForDrop(dragPartyKey, seatMapHoverTableId, dragInsertBeforeKey)
  }, [dragPartyKey, seatMapHoverTableId, dragInsertBeforeKey, computePreviewSeatRangeForDrop])

  const refreshScrubMetrics = useCallback(() => {
    const wrap = workspaceRef.current
    if (!wrap) return
    setScrubMetrics({
      cw: wrap.clientWidth,
      sw: wrap.scrollWidth,
      sl: wrap.scrollLeft,
    })
  }, [])

  useEffect(() => {
    refreshScrubMetrics()
    const wrap = workspaceRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => refreshScrubMetrics())
    ro.observe(wrap)
    window.addEventListener('resize', refreshScrubMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', refreshScrubMetrics)
    }
  }, [refreshScrubMetrics, rows, tables, dockCollapsed, loading, plannerTables.length])

  const handleWorkspaceScroll = useCallback(() => {
    refreshScrubMetrics()
  }, [refreshScrubMetrics])

  return (
    <div className="admin-page-shell flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <p className="sr-only" aria-live="polite">
        {error ?? ''}
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
                onScroll={handleWorkspaceScroll}
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
                      const list = partiesOnTable(t.id)
                      const topSeatMax = Math.floor(cap / 2)
                      const firstBottomIndex = list.findIndex(
                        (p) => p.minSeat != null && p.minSeat > topSeatMax
                      )
                      const tableAvatarUrl = tableAvatarById.get(t.id) ?? ''
                      const tableTeamGradient =
                        tableGradientById.get(t.id) ??
                        'linear-gradient(145deg, #1ca0d8, #5b38f2)'
                      const laneFlash = dropFlash === t.id
                      return (
                        <div
                          key={t.id}
                          ref={setLaneRef(t.id)}
                          data-table-lane={t.id}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            setDragHoverTableId(t.id)
                            setDragInsertBeforeKey(null)
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
                          className={`flex max-h-[min(78vh,920px)] min-h-0 w-[min(100vw-2rem,500px)] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#ebebeb] bg-white shadow-none ${
                            laneFlash ? 'ring-2 ring-[#5b38f2]/35' : ''
                          }`}
                        >
                          <div className="shrink-0 px-1.5 pt-1.5 pb-0.5">
                            <div
                              onDragOver={(e) => {
                                if (!dragPartyKey) return
                                e.preventDefault()
                                e.stopPropagation()
                                e.dataTransfer.dropEffect = 'move'
                                setSeatMapHoverTableId(t.id)
                                setDragHoverTableId(t.id)
                                setDragInsertBeforeKey(null)
                              }}
                            >
                              <AdminTableTwinSeatMap
                                capacity={cap}
                                attendeesAtTable={rowsAtTable(t.id)}
                                partiesOnTable={list}
                                highlightPartyKey={highlightPartyKey}
                                previewSeatRange={
                                  seatMapHoverTableId === t.id ? previewSeatRange : null
                                }
                                previewGhostMembers={
                                  seatMapHoverTableId === t.id ? previewGhostMembers : null
                                }
                              />
                            </div>
                          </div>

                          <div
                            className="flex shrink-0 items-center justify-between gap-3 border-y border-white/25 px-3 py-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
                            style={{ backgroundImage: tableTeamGradient }}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/45 shadow-sm ring-1 ring-black/10">
                                {tableAvatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={tableAvatarUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="h-full w-full" style={tableSwatchStyle(t.color)} aria-hidden />
                                )}
                              </div>
                              <h2 className="truncate text-[14px] font-semibold text-white">
                                {t.name}
                              </h2>
                            </div>
                            <div className="shrink-0 text-center text-[11px] font-semibold tabular-nums text-white/95">
                              {used} / {cap}
                            </div>
                            <button
                              type="button"
                              onClick={() => setLargeMapTableId(t.id)}
                              className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full border border-white/55 bg-white/95 px-2.5 text-[11px] font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-white"
                            >
                              Large view
                            </button>
                          </div>

                        <div
                          className="admin-scroll-area flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-1.5"
                          onDragOver={(e) => {
                            if (!dragPartyKey) return
                            e.preventDefault()
                            e.stopPropagation()
                            setDragHoverTableId(t.id)
                            setDragInsertBeforeKey(null)
                            e.dataTransfer.dropEffect = 'move'
                          }}
                        >
                            {list.length === 0 ? (
                              <p className="px-1 py-6 text-center text-[13px] text-zinc-500">
                                Drag a party here, or assign from the Parties panel.
                              </p>
                            ) : (
                              list.map((p, idx) => {
                                const rowDraggable = !busy && !p.splitWarning
                                return (
                                  <div key={p.key} className="contents">
                                    {firstBottomIndex > 0 && idx === firstBottomIndex ? (
                                      <div className="mx-1 my-1.5 flex items-center gap-2">
                                        <div className="h-px flex-1 bg-zinc-200" />
                                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                          Bottom side
                                        </span>
                                        <div className="h-px flex-1 bg-zinc-200" />
                                      </div>
                                    ) : null}
                                    {dragPartyKey &&
                                    dragHoverTableId === t.id &&
                                    dragInsertBeforeKey === p.key ? (
                                      <div className="mx-1 h-[3px] rounded-full bg-[#3b82f6] shadow-[0_0_0_1px_rgba(59,130,246,0.15)]" />
                                    ) : null}
                                    <div
                                      data-party-key={p.key}
                                      draggable={rowDraggable}
                                      onDragStart={(e) => startPartyDrag(e, p.key, rowDraggable)}
                                      onDragEnd={endPartyDrag}
                                      onDragOver={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        if (dragPartyKey) {
                                          setDragHoverTableId(t.id)
                                          setDragInsertBeforeKey(p.key)
                                        }
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
                                      onMouseEnter={() => setHoveredPartyKey(p.key)}
                                      onMouseLeave={() => setHoveredPartyKey(null)}
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
                                  </div>
                                )
                              })
                            )}
                            {dragPartyKey &&
                            dragHoverTableId === t.id &&
                            dragInsertBeforeKey === null ? (
                              <div className="mx-1 mt-1 h-[3px] rounded-full bg-[#3b82f6] shadow-[0_0_0_1px_rgba(59,130,246,0.15)]" />
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="shrink-0 border-t border-[#ebebeb] bg-white px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    Pan
                  </span>
                  <div
                    ref={scrubTrackRef}
                    className="relative h-9 min-w-0 flex-1 rounded-full border border-zinc-200/80 bg-zinc-100/90 px-1"
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('[data-scrub-thumb]')) return
                      const wrap = workspaceRef.current
                      const track = scrubTrackRef.current
                      if (!wrap || !track || wrap.scrollWidth <= wrap.clientWidth + 1) return
                      e.preventDefault()
                      const rect = track.getBoundingClientRect()
                      const max = Math.max(0, wrap.scrollWidth - wrap.clientWidth)
                      const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                      wrap.scrollLeft = p * max
                      refreshScrubMetrics()
                    }}
                  >
                    {scrubMetrics.sw > scrubMetrics.cw + 1 ? (
                      (() => {
                        const maxScroll = Math.max(1, scrubMetrics.sw - scrubMetrics.cw)
                        const thumbPct = Math.max(
                          12,
                          Math.min(100, (scrubMetrics.cw / scrubMetrics.sw) * 100)
                        )
                        const leftPct = Math.max(
                          0,
                          Math.min(100 - thumbPct, (scrubMetrics.sl / maxScroll) * (100 - thumbPct))
                        )
                        return (
                          <div
                            data-scrub-thumb
                            role="slider"
                            aria-label="Pan seating workspace horizontally"
                            aria-valuemin={0}
                            aria-valuemax={Math.round(maxScroll)}
                            aria-valuenow={Math.round(scrubMetrics.sl)}
                            className="absolute top-1 bottom-1 cursor-grab touch-none rounded-full bg-zinc-600 shadow-sm active:cursor-grabbing"
                            style={{ width: `${thumbPct}%`, left: `${leftPct}%` }}
                            onPointerDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const wrap = workspaceRef.current
                              const track = scrubTrackRef.current
                              if (!wrap || !track) return
                              const startX = e.clientX
                              const startScroll = wrap.scrollLeft
                              const max = Math.max(0, wrap.scrollWidth - wrap.clientWidth)
                              const trackW = track.clientWidth
                              const thumbW = Math.max(
                                40,
                                (wrap.clientWidth / wrap.scrollWidth) * trackW
                              )
                              const dragRange = Math.max(1, trackW - thumbW)
                              const onMove = (ev: PointerEvent) => {
                                const dx = ev.clientX - startX
                                wrap.scrollLeft = Math.max(
                                  0,
                                  Math.min(max, startScroll + (dx / dragRange) * max)
                                )
                                refreshScrubMetrics()
                              }
                              const onUp = () => {
                                window.removeEventListener('pointermove', onMove)
                                window.removeEventListener('pointerup', onUp)
                                refreshScrubMetrics()
                              }
                              window.addEventListener('pointermove', onMove)
                              window.addEventListener('pointerup', onUp)
                            }}
                          />
                        )
                      })()
                    ) : (
                      <div className="pointer-events-none absolute inset-x-1 top-1 bottom-1 rounded-full bg-zinc-200/70" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <aside
              className={`relative z-[60] flex shrink-0 flex-col border-l border-[#ebebeb] bg-white shadow-[-8px_0_24px_-20px_rgba(0,0,0,0.12)] transition-[width] duration-200 ${
                dockCollapsed ? 'w-14' : 'w-[min(100%,430px)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setDockCollapsed((v) => !v)}
                aria-label={dockCollapsed ? 'Expand party panel' : 'Collapse party panel'}
                className="absolute -left-4 top-1/2 z-[70] inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black text-white shadow-sm transition-transform duration-200 hover:scale-[1.04]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 transition-transform ${dockCollapsed ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>

              {!dockCollapsed ? (
                <>
                  <div className="shrink-0 space-y-3 border-b border-[#ebebeb] px-4 py-3">
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
                            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold tabular-nums text-zinc-700">
                              {n}
                            </span>
                          </>
                        ),
                      }))}
                    />
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
                                    onClick={() => {
                                      setSelectedPartyKey(p.key)
                                      focusPartyInWorkspace(p)
                                    }}
                                    onMouseEnter={() => setHoveredPartyKey(p.key)}
                                    onMouseLeave={() => setHoveredPartyKey(null)}
                                    className="block w-full cursor-pointer text-left"
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
                                          <span className="font-medium text-zinc-700">
                                            {assignedTable}
                                          </span>
                                          {p.minSeat != null && p.maxSeat != null ? (
                                            <>
                                              <span className="text-zinc-400"> · </span>
                                              <span className="tabular-nums">{seatRangeLabel(p)}</span>
                                            </>
                                          ) : null}
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-zinc-400"> · </span>
                                          <span className="font-medium text-amber-800/90">
                                            Not seated
                                          </span>
                                        </>
                                      )}
                                    </p>
                                  </button>
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
                </>
              ) : null}
            </aside>
          </>
        )}
      </section>
      {largeMapTableId ? (
        <LargeSeatingOverlay
          table={plannerTables.find((t) => t.id === largeMapTableId) ?? null}
          rows={rows}
          parties={parties}
          highlightPartyKey={highlightPartyKey}
          previewSeatRange={previewSeatRange}
          previewGhostMembers={previewGhostMembers}
          dragPartyKey={dragPartyKey}
          busy={busy}
          readDragPartyKey={readDragPartyKey}
          handleDropOnTable={handleDropOnTable}
          setDragHoverTableId={setDragHoverTableId}
          setDragInsertBeforeKey={setDragInsertBeforeKey}
          setSeatMapHoverTableId={setSeatMapHoverTableId}
          setHoveredPartyKey={setHoveredPartyKey}
          startPartyDrag={startPartyDrag}
          endPartyDrag={endPartyDrag}
          runPlan={runPlan}
          tableNameById={tableNameById}
          reloadRows={loadAll}
          showToast={showToast}
          onClose={() => setLargeMapTableId(null)}
        />
      ) : null}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center">
          <div
            className={`inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm animate-[fadeIn_180ms_ease-out] ${
              toast.kind === 'success'
                ? 'border-emerald-200 text-emerald-700'
                : 'border-rose-200 text-rose-700'
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
              {toast.kind === 'success' ? (
                <path d="m5 12 5 5L20 7" />
              ) : (
                <path d="M12 8v5m0 3h.01" />
              )}
            </svg>
            <span>{toast.message}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
