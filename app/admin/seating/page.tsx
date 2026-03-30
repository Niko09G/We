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
  const workspaceRef = useRef<HTMLDivElement>(null)
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
                          className={`flex w-[min(100vw-2rem,500px)] shrink-0 flex-col rounded-2xl border border-[#ebebeb] bg-white shadow-none ${
                            laneFlash ? 'ring-2 ring-[#5b38f2]/35' : ''
                          }`}
                        >
                          <div className="px-1.5 pt-1.5 pb-0.5">
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

                          <div className="flex items-center justify-between gap-3 border-y border-[#ebebeb] px-3 py-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#ebebeb] shadow-sm">
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
                              <h2 className="truncate text-[14px] font-semibold text-zinc-900">
                                {t.name}
                              </h2>
                            </div>
                            <div className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-500">
                              {used} / {cap}
                            </div>
                          </div>

                        <div
                          className="flex min-h-[220px] flex-1 flex-col gap-1 px-2 py-1.5"
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
                className="absolute -left-4 top-3 z-[70] inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black text-white shadow-sm transition-transform duration-200 hover:scale-[1.04]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 transition-transform ${dockCollapsed ? '' : 'rotate-180'}`}
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
