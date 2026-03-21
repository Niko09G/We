'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listAttendeesForAdmin,
  updateAttendee,
  type AttendeeRow,
} from '@/lib/admin-attendees'
import { listAttendeeGroups, type AttendeeGroupRow } from '@/lib/admin-attendee-groups'
import { listTablesForAdmin } from '@/lib/admin-tables'

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  const v = `${a}${b}`.toUpperCase()
  return v || 'G'
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}

/** Same logic as seating planner — couple / family display title. */
function partyTitle(members: AttendeeRow[], group: AttendeeGroupRow): string {
  const adults = members
    .filter(
      (m) =>
        !m.is_placeholder &&
        (m.party_role === 'lead_adult' ||
          m.party_role === 'lead' ||
          m.party_role === 'spouse')
    )
    .sort((a, b) => {
      const pr = (x: AttendeeRow) => {
        if (x.party_role === 'lead_adult' || x.party_role === 'lead') return 0
        if (x.party_role === 'spouse') return 1
        return 9
      }
      const d = pr(a) - pr(b)
      if (d !== 0) return d
      const da = new Date(a.created_at).getTime()
      const db = new Date(b.created_at).getTime()
      if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db
      return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
    })

  if (adults.length >= 2) {
    return `${firstName(adults[0]!.full_name)} & ${firstName(adults[1]!.full_name)}`
  }
  if (adults.length === 1) return firstName(adults[0]!.full_name)

  const named = members
    .filter((m) => !m.is_placeholder)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (named.length === 1) return named[0]!.full_name
  return group.group_name
}

function sortPartyMembers(a: AttendeeRow, b: AttendeeRow): number {
  const pr = (m: AttendeeRow) => {
    if (m.party_role === 'lead_adult' || m.party_role === 'lead') return 0
    if (m.party_role === 'spouse') return 1
    if (m.party_role === 'child') return 2
    return 3
  }
  const d = pr(a) - pr(b)
  if (d !== 0) return d
  return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
}

function nameMatchesQuery(fullName: string, queryRaw: string): boolean {
  const q = queryRaw.trim().toLowerCase()
  if (!q) return true
  const nameLower = fullName.trim().toLowerCase()
  const nameParts = nameLower.split(/\s+/).filter(Boolean)
  const queryParts = q.split(/\s+/).filter(Boolean)
  if (queryParts.length === 0) return true
  return queryParts.every((tok) => {
    if (nameLower.includes(tok)) return true
    return nameParts.some((part) => part.includes(tok))
  })
}

function partyTableSeatSummary(
  members: AttendeeRow[],
  tableNameById: Map<string, string>
): string | null {
  const seated = members.filter((m) => m.table_id != null && m.seat_number != null)
  if (seated.length === 0) return null
  const tableIds = Array.from(new Set(seated.map((m) => m.table_id)))
  if (tableIds.length !== 1) return 'Multiple tables'
  const tid = tableIds[0] as string
  const name = tableNameById.get(tid) ?? 'Table'
  const nums = seated.map((m) => m.seat_number as number)
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  return lo === hi ? `${name} · seat ${lo}` : `${name} · seats ${lo}–${hi}`
}

type StatFilter = 'all' | 'checked' | 'unchecked'

type PartyListItem = { kind: 'party'; groupId: string }
type SoloListItem = { kind: 'solo'; member: AttendeeRow }
type ListItem = PartyListItem | SoloListItem

export default function CheckInPage() {
  const [rows, setRows] = useState<AttendeeRow[]>([])
  const [groups, setGroups] = useState<AttendeeGroupRow[]>([])
  const [tableNameById, setTableNameById] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [attendingOnly, setAttendingOnly] = useState(false)
  const [statFilter, setStatFilter] = useState<StatFilter>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const inputRef = useRef<HTMLInputElement | null>(null)

  const groupById = useMemo(() => {
    const m = new Map<string, AttendeeGroupRow>()
    for (const g of groups) m.set(g.id, g)
    return m
  }, [groups])

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [attendees, grps, tbls] = await Promise.all([
        listAttendeesForAdmin(),
        listAttendeeGroups(),
        listTablesForAdmin(),
      ])
      setRows(attendees)
      setGroups(grps)
      setTableNameById(new Map(tbls.map((t) => [t.id, t.name])))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load guests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const baseRows = useMemo(() => {
    if (!attendingOnly) return rows
    return rows.filter((r) => (r.rsvp_status ?? '').trim().toLowerCase() === 'yes')
  }, [rows, attendingOnly])

  const stats = useMemo(() => {
    const total = baseRows.length
    const checkedIn = baseRows.filter((r) => r.checked_in_at).length
    const remaining = total - checkedIn
    return { total, checkedIn, remaining }
  }, [baseRows])

  const statFilteredRows = useMemo(() => {
    if (statFilter === 'all') return baseRows
    if (statFilter === 'checked') return baseRows.filter((r) => r.checked_in_at)
    return baseRows.filter((r) => !r.checked_in_at)
  }, [baseRows, statFilter])

  const searchFilteredRows = useMemo(() => {
    return statFilteredRows.filter((r) => nameMatchesQuery(r.full_name, search))
  }, [statFilteredRows, search])

  const listItems = useMemo((): ListItem[] => {
    const seenParty = new Set<string>()
    const parties: PartyListItem[] = []
    const solos: SoloListItem[] = []
    for (const r of searchFilteredRows) {
      if (r.group_id) {
        if (!seenParty.has(r.group_id)) {
          seenParty.add(r.group_id)
          parties.push({ kind: 'party', groupId: r.group_id })
        }
      } else {
        solos.push({ kind: 'solo', member: r })
      }
    }
    parties.sort((a, b) => {
      const ma = rows.filter((x) => x.group_id === a.groupId).sort(sortPartyMembers)[0]
      const mb = rows.filter((x) => x.group_id === b.groupId).sort(sortPartyMembers)[0]
      return (ma?.full_name ?? '').localeCompare(mb?.full_name ?? '', undefined, {
        sensitivity: 'base',
      })
    })
    solos.sort((a, b) =>
      a.member.full_name.localeCompare(b.member.full_name, undefined, {
        sensitivity: 'base',
      })
    )
    return [...parties, ...solos]
  }, [searchFilteredRows, rows])

  function fullPartyMembers(groupId: string): AttendeeRow[] {
    return rows.filter((r) => r.group_id === groupId).sort(sortPartyMembers)
  }

  function togglePartyExpanded(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function flashCheckIn(id: string) {
    const prev = flashTimers.current.get(id)
    if (prev) clearTimeout(prev)
    setFlashIds((s) => new Set(s).add(id))
    const t = setTimeout(() => {
      setFlashIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
      flashTimers.current.delete(id)
    }, 900)
    flashTimers.current.set(id, t)
  }

  function setBusy(id: string, on: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function patchRowLocal(id: string, patch: Partial<AttendeeRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r))
    )
  }

  /** Single control: check in (timestamp) or undo (null). UI updates immediately; flash only on check-in. */
  async function toggleCheckInOne(id: string) {
    const row = rows.find((r) => r.id === id)
    if (!row) return

    if (row.checked_in_at) {
      const previous = row.checked_in_at
      patchRowLocal(id, { checked_in_at: null })
      setBusy(id, true)
      setError(null)
      try {
        await updateAttendee(id, { checked_in_at: null })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Undo failed.')
        patchRowLocal(id, { checked_in_at: previous })
        await loadAll()
      } finally {
        setBusy(id, false)
      }
      return
    }

    const ts = new Date().toISOString()
    const previous = row.checked_in_at
    patchRowLocal(id, { checked_in_at: ts })
    flashCheckIn(id)
    setBusy(id, true)
    setError(null)
    try {
      await updateAttendee(id, { checked_in_at: ts })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-in failed.')
      patchRowLocal(id, { checked_in_at: previous })
      await loadAll()
    } finally {
      setBusy(id, false)
    }
  }

  /** Check in everyone unchecked, or undo everyone if already all checked in. */
  async function togglePartyCheckInByGroupId(groupId: string) {
    const members = rows.filter((r) => r.group_id === groupId)
    if (members.length === 0) return

    const allCheckedIn =
      members.length > 0 && members.every((m) => Boolean(m.checked_in_at))

    if (allCheckedIn) {
      const reverts = members.map((m) => ({ id: m.id, prev: m.checked_in_at }))
      for (const m of members) {
        patchRowLocal(m.id, { checked_in_at: null })
      }
      setError(null)
      for (const m of members) setBusy(m.id, true)
      try {
        await Promise.all(
          members.map((m) => updateAttendee(m.id, { checked_in_at: null }))
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Undo failed.')
        for (const { id, prev } of reverts) {
          patchRowLocal(id, { checked_in_at: prev })
        }
        await loadAll()
      } finally {
        for (const m of members) setBusy(m.id, false)
      }
      return
    }

    const toCheck = members.filter((m) => !m.checked_in_at)
    if (toCheck.length === 0) return
    const ts = new Date().toISOString()
    const reverts = toCheck.map((m) => ({ id: m.id, prev: m.checked_in_at }))
    for (const m of toCheck) {
      patchRowLocal(m.id, { checked_in_at: ts })
      flashCheckIn(m.id)
    }
    setError(null)
    for (const m of toCheck) setBusy(m.id, true)
    try {
      await Promise.all(
        toCheck.map((m) => updateAttendee(m.id, { checked_in_at: ts }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-in failed.')
      for (const { id, prev } of reverts) {
        patchRowLocal(id, { checked_in_at: prev })
      }
      await loadAll()
    } finally {
      for (const m of toCheck) setBusy(m.id, false)
    }
  }

  function seatOnlyLabel(r: AttendeeRow): string | null {
    if (r.seat_number == null) return null
    return `Seat ${r.seat_number}`
  }

  function renderMemberRow(m: AttendeeRow) {
    const checked = Boolean(m.checked_in_at)
    const busy = busyIds.has(m.id)
    const flashing = flashIds.has(m.id)
    const seat = seatOnlyLabel(m)

    return (
      <div
        key={m.id}
        className={`flex items-center gap-3 py-2.5 pl-1 transition-[background-color,box-shadow] duration-300 ${
          flashing ? 'rounded-md bg-emerald-50/90 shadow-[inset_3px_0_0_0_rgb(52,211,153)] dark:bg-emerald-950/25' : ''
        }`}
      >
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-zinc-200/80 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800">
          {m.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
              {getInitials(m.full_name)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {m.full_name}
          </p>
          {seat ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{seat}</p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleCheckInOne(m.id)}
          className={
            checked
              ? 'shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 active:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:active:bg-zinc-800'
              : 'shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white active:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900'
          }
        >
          {checked ? 'Undo' : 'Check in'}
        </button>
      </div>
    )
  }

  function renderPartyAccordion(groupId: string) {
    const group = groupById.get(groupId)
    if (!group) return null

    const members = fullPartyMembers(groupId)
    if (members.length === 0) return null

    const title = partyTitle(members, group)
    const checkedCount = members.filter((m) => m.checked_in_at).length
    const total = members.length
    const seatSummary = partyTableSeatSummary(members, tableNameById)
    const expanded = expandedGroups.has(groupId)
    const anyUnchecked = checkedCount < total
    const partyBusy = members.some((m) => busyIds.has(m.id))

    return (
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex w-full items-stretch gap-0">
          <button
            type="button"
            onClick={() => togglePartyExpanded(groupId)}
            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left active:bg-zinc-50 dark:active:bg-zinc-800/80"
            aria-expanded={expanded}
          >
            <span className="shrink-0 text-zinc-400" aria-hidden>
              {expanded ? '▾' : '▸'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {title}
              </p>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {checkedCount} / {total} checked in
              </p>
              {seatSummary ? (
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{seatSummary}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 -space-x-1.5 pr-1">
              {members.slice(0, 5).map((m) => (
                <div
                  key={m.id}
                  className="h-8 w-8 overflow-hidden rounded-full border-2 border-white bg-zinc-100 dark:border-zinc-900 dark:bg-zinc-800"
                >
                  {m.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-zinc-600 dark:text-zinc-300">
                      {getInitials(m.full_name)}
                    </div>
                  )}
                </div>
              ))}
              {members.length > 5 ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-zinc-200 text-[10px] font-semibold text-zinc-600 dark:border-zinc-900 dark:bg-zinc-700 dark:text-zinc-300">
                  +{members.length - 5}
                </div>
              ) : null}
            </div>
          </button>
          <div className="flex shrink-0 flex-col justify-center border-l border-zinc-100 px-2 py-2 dark:border-zinc-800">
            {anyUnchecked ? (
              <button
                type="button"
                disabled={partyBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  void togglePartyCheckInByGroupId(groupId)
                }}
                className="rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white active:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:text-zinc-950"
              >
                Check in all
              </button>
            ) : (
              <button
                type="button"
                disabled={partyBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  void togglePartyCheckInByGroupId(groupId)
                }}
                className="max-w-[5.5rem] rounded-lg border border-zinc-300 bg-white px-2.5 py-2.5 text-center text-xs font-bold text-zinc-800 active:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:active:bg-zinc-800"
              >
                Undo all
              </button>
            )}
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-zinc-100 bg-zinc-50/80 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950/40">
            <div className="ml-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {members.map((m) => (
                  <li key={m.id}>{renderMemberRow(m)}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function renderSoloRow(member: AttendeeRow) {
    const checked = Boolean(member.checked_in_at)
    const busy = busyIds.has(member.id)
    const flashing = flashIds.has(member.id)
    const seat = seatOnlyLabel(member)
    const tableLine =
      member.table_id != null
        ? `${tableNameById.get(member.table_id) ?? 'Table'}${seat ? ` · ${seat}` : ''}`
        : seat

    return (
      <div
        className={`flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 transition-[background-color,box-shadow] duration-300 dark:border-zinc-700 dark:bg-zinc-900 ${
          flashing ? 'bg-emerald-50/90 shadow-[0_0_0_2px_rgba(52,211,153,0.45)] dark:bg-emerald-950/25' : ''
        }`}
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800">
          {member.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              {getInitials(member.full_name)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
            {member.full_name}
          </p>
          {tableLine ? (
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{tableLine}</p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleCheckInOne(member.id)}
          className={
            checked
              ? 'shrink-0 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 active:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:active:bg-zinc-800'
              : 'shrink-0 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white active:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900'
          }
        >
          {checked ? 'Undo' : 'Check in'}
        </button>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-3 py-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] dark:bg-zinc-950 md:px-6">
      <div className="mx-auto max-w-lg">
        <header className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Event day
          </p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Check-in</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Tap a party to expand. Check in guests as they arrive.
          </p>
        </header>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setAttendingOnly(false)}
            className={`flex-1 rounded-xl py-3 text-base font-semibold ${
              !attendingOnly
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setAttendingOnly(true)}
            className={`flex-1 rounded-xl py-3 text-base font-semibold ${
              attendingOnly
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200'
            }`}
          >
            Attending only
          </button>
        </div>

        <input
          ref={inputRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="mb-4 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-base text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-center text-zinc-500">Loading…</p>
        ) : listItems.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            No guests match this view.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {listItems.map((item) =>
              item.kind === 'solo' ? (
                <li key={item.member.id}>{renderSoloRow(item.member)}</li>
              ) : (
                <li key={item.groupId}>{renderPartyAccordion(item.groupId)}</li>
              )
            )}
          </ul>
        )}

        <div className="mt-8 pb-2">
          <Link
            href="/play"
            className="inline-flex rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            ← Lobby
          </Link>
        </div>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95"
        aria-label="Guest counts and filters"
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            type="button"
            onClick={() => setStatFilter('all')}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center transition ${
              statFilter === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-800 active:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:active:bg-zinc-700'
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
              Total
            </span>
            <span className="text-lg font-bold tabular-nums">{stats.total}</span>
          </button>
          <button
            type="button"
            onClick={() => setStatFilter('checked')}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center transition ${
              statFilter === 'checked'
                ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950'
                : 'bg-emerald-50 text-emerald-900 active:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-100 dark:active:bg-emerald-900/40'
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
              In
            </span>
            <span className="text-lg font-bold tabular-nums">{stats.checkedIn}</span>
          </button>
          <button
            type="button"
            onClick={() => setStatFilter('unchecked')}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center transition ${
              statFilter === 'unchecked'
                ? 'bg-amber-500 text-zinc-950 dark:bg-amber-400 dark:text-zinc-950'
                : 'bg-amber-50 text-amber-950 active:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-100 dark:active:bg-amber-900/30'
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
              Left
            </span>
            <span className="text-lg font-bold tabular-nums">{stats.remaining}</span>
          </button>
        </div>
      </nav>
    </main>
  )
}
