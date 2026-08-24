'use client'

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { archiveAttendee, listAttendeesForAdmin, type AttendeeRow } from '@/lib/admin-attendees'
import { listAttendeeGroups, type AttendeeGroupRow } from '@/lib/admin-attendee-groups'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import { physicalTableAdminLabel, resolveTeamId } from '@/lib/table-teams'
import { AdminFilterRowSegmented } from '@/app/admin/_components/AdminFilterRowSegmented'
import { AdminSelectDropdown } from '@/app/admin/_components/AdminSelectDropdown'
import {
  AttendeeEditorOverlay,
  type AttendeePartyBlock,
} from '@/app/admin/attendees/_components/AttendeeEditorOverlay'

type GuestListChip = 'all' | 'yes' | 'pending' | 'no'

function isPendingResponseRow(r: AttendeeRow): boolean {
  const s = (r.rsvp_status ?? '').trim().toLowerCase()
  return s === '' || s === 'pending'
}

function rowMatchesGuestListChip(r: AttendeeRow, chip: GuestListChip): boolean {
  switch (chip) {
    case 'all':
      return true
    case 'yes':
      return (r.rsvp_status ?? '').trim().toLowerCase() === 'yes'
    case 'pending':
      return isPendingResponseRow(r)
    case 'no':
      return (r.rsvp_status ?? '').trim().toLowerCase() === 'no'
    default:
      return true
  }
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  const v = `${a}${b}`.toUpperCase()
  return v || 'G'
}

function getPartyTitle(members: AttendeeRow[], group: AttendeeGroupRow): string {
  const firstName = (fullName: string) => {
    const v = fullName.trim().split(/\s+/).filter(Boolean)[0]
    return v ?? ''
  }

  const adults = members
    .filter(
      (m) =>
        !m.is_placeholder &&
        (m.party_role === 'lead_adult' ||
          m.party_role === 'lead' ||
          m.party_role === 'spouse')
    )
    .sort((a, b) => {
      // Lead adult -> spouse ordering, then created_at (oldest first)
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

  // Backward-compatible fallback when party_role is missing:
  // pick the oldest real named attendee; otherwise fall back to group_name.
  const named = members
    .filter((m) => !m.is_placeholder)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (named.length === 1) return named[0]!.full_name
  return group.group_name
}

function computePartyKidsCount(members: AttendeeRow[]): number {
  return members.filter((m) => m.party_role === 'child').length
}

function computePartyExtraGuestsCount(members: AttendeeRow[]): number {
  return members.filter((m) => {
    if (m.party_role === 'guest') return true
    if (m.party_role === 'placeholder') return true
    if (m.is_placeholder && m.party_role !== 'child') return true
    return false
  }).length
}

function childMembersOf(members: AttendeeRow[]): AttendeeRow[] {
  return members.filter((m) => m.party_role === 'child')
}

function extraGuestsMembersOf(members: AttendeeRow[]): AttendeeRow[] {
  return members.filter((m) => {
    if (m.party_role === 'guest') return true
    if (m.party_role === 'placeholder') return true
    if (m.is_placeholder && m.party_role !== 'child') return true
    return false
  })
}

/** Lead adults + spouse only (no kids, guests, or placeholders) for party header avatars. */
function parentMembersOf(members: AttendeeRow[]): AttendeeRow[] {
  const pr = (m: AttendeeRow) => {
    if (m.party_role === 'lead_adult' || m.party_role === 'lead') return 0
    if (m.party_role === 'spouse') return 1
    return 9
  }
  return members
    .filter(
      (m) =>
        !m.is_placeholder &&
        (m.party_role === 'lead_adult' ||
          m.party_role === 'lead' ||
          m.party_role === 'spouse')
    )
    .sort((a, b) => {
      const d = pr(a) - pr(b)
      if (d !== 0) return d
      const da = new Date(a.created_at).getTime()
      const db = new Date(b.created_at).getTime()
      if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db
      return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
    })
}

function ArchiveGuestIconButton({
  onClick,
  disabled,
}: {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label="Remove guest"
      title="Remove guest"
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 cursor-pointer shrink-0 items-center justify-center rounded-full text-[18px] font-light leading-none text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-300"
    >
      ×
    </button>
  )
}

function MiniAvatarStack({
  members,
  max = 3,
  showOverflowBadge = false,
}: {
  members: AttendeeRow[]
  max?: number
  showOverflowBadge?: boolean
}) {
  if (members.length === 0) return null
  const shown = members.slice(0, max)
  return (
    <div className="flex items-center justify-center">
      <div className="flex -space-x-1.5">
        {shown.map((m) => (
          <div
            key={m.id}
            className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
            title={m.full_name}
          >
            {m.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.photo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-700 dark:text-zinc-200">
                {getInitials(m.full_name)}
              </div>
            )}
          </div>
        ))}
      </div>
      {showOverflowBadge && members.length > max ? (
        <span className="ml-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
          +{members.length - max}
        </span>
      ) : null}
    </div>
  )
}

function computePartySeatAndTable(
  members: AttendeeRow[],
  tables: AdminTableRow[]
): { tableLabel: string; seatLabel: string } {
  const seated = members.filter(
    (m) => m.table_id != null && m.seat_number != null
  )

  if (seated.length === 0) return { tableLabel: '—', seatLabel: '—' }

  const tableById = new Map(tables.map((t) => [t.id, t]))
  const uniqueTableIds = Array.from(new Set(seated.map((m) => m.table_id))) as string[]
  const uniqueTeamIds = Array.from(
    new Set(
      uniqueTableIds.map((id) => {
        const t = tableById.get(id)
        return t ? resolveTeamId(t) : id
      })
    )
  )

  const seatNums = seated
    .map((m) => m.seat_number)
    .filter((n): n is number => n != null)
  const min = Math.min(...seatNums)
  const max = Math.max(...seatNums)
  const seatLabel = uniqueTableIds.length === 1
    ? seatNums.length === 1
      ? String(min)
      : `${min}–${max}`
    : '—'

  if (uniqueTableIds.length === 1) {
    const table = tableById.get(uniqueTableIds[0]!)
    return {
      tableLabel: table ? physicalTableAdminLabel(table, tables) : uniqueTableIds[0]!.slice(0, 8),
      seatLabel,
    }
  }

  if (uniqueTeamIds.length === 1) {
    const teamTable = tables.find((t) => resolveTeamId(t) === uniqueTeamIds[0])
    return {
      tableLabel: teamTable?.team_name || teamTable?.name || '—',
      seatLabel,
    }
  }

  return { tableLabel: '—', seatLabel: '—' }
}

function computePartyRsvpBadge(members: AttendeeRow[]): {
  text: string
  className: string
} {
  const statuses = members
    .map((m) => (m.rsvp_status ?? '').toLowerCase())
    .filter((s) => s.length > 0)

  if (statuses.length === 0) {
    return {
      text: '—',
      className: 'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    }
  }

  const hasPending = statuses.includes('pending')
  const hasNo = statuses.includes('no')
  const hasYes = statuses.includes('yes')

  const chosen = hasPending ? 'pending' : hasNo ? 'no' : hasYes ? 'yes' : statuses[0] ?? 'pending'

  const classYes =
    'bg-emerald-500/15 text-emerald-700 border border-emerald-500/25 dark:bg-emerald-400/10 dark:text-emerald-200 dark:border-emerald-400/20'
  const classNo =
    'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
  const classPending =
    'bg-violet-500/15 text-violet-700 border border-violet-500/25 dark:bg-violet-400/10 dark:text-violet-200 dark:border-violet-400/20'

  if (chosen === 'yes') return { text: 'Yes', className: classYes }
  if (chosen === 'no') return { text: 'No', className: classNo }
  return { text: 'Pending', className: classPending }
}

export default function AdminAttendeesPage() {
  const [rows, setRows] = useState<AttendeeRow[]>([])
  const [groups, setGroups] = useState<AttendeeGroupRow[]>([])
  const [tables, setTables] = useState<AdminTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const [search, setSearch] = useState('')
  const [guestListChip, setGuestListChip] = useState<GuestListChip>('all')
  const [tableFilterId, setTableFilterId] = useState<string>('all')
  const [attendeeEditorOpen, setAttendeeEditorOpen] = useState(false)
  const [attendeeEditorMode, setAttendeeEditorMode] = useState<'create' | 'edit'>('create')
  const [attendeeEditorParty, setAttendeeEditorParty] = useState<AttendeePartyBlock | null>(
    null
  )

  /**
   * Canonical list: always from Supabase after any mutation that changes roster data.
   * `showPageLoading`: full-page skeleton (initial load only); otherwise silent reload.
   */
  const loadAll = useCallback(async (opts?: { showPageLoading?: boolean }) => {
    const showPageLoading = opts?.showPageLoading !== false
    if (showPageLoading) {
      setLoading(true)
      setError(null)
    }
    try {
      const [a, t, g] = await Promise.all([
        listAttendeesForAdmin(),
        listTablesForAdmin(),
        listAttendeeGroups(),
      ])
      setRows(a)
      setTables(t.filter((x) => !x.is_archived))
      setGroups(g)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load.'
      setError(msg)
      setToast({ kind: 'error', message: msg })
      if (showPageLoading) {
        setRows([])
        setGroups([])
      }
      throw e
    } finally {
      if (showPageLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll({ showPageLoading: true })
  }, [loadAll])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(t)
  }, [toast])

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) m.set(g.id, g.group_name)
    return m
  }, [groups])

  const tableNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tables) m.set(t.id, physicalTableAdminLabel(t, tables))
    return m
  }, [tables])

  const rowsForChipCounts = useMemo(() => {
    if (tableFilterId === 'all') return rows
    return rows.filter((r) => r.table_id === tableFilterId)
  }, [rows, tableFilterId])

  const chipCounts = useMemo(() => {
    const base = rowsForChipCounts
    return {
      all: base.length,
      yes: base.filter(
        (r) => (r.rsvp_status ?? '').trim().toLowerCase() === 'yes'
      ).length,
      pending: base.filter((r) => isPendingResponseRow(r)).length,
      no: base.filter(
        (r) => (r.rsvp_status ?? '').trim().toLowerCase() === 'no'
      ).length,
    }
  }, [rowsForChipCounts])

  const tableOptionsWithCounts = useMemo(() => {
    return tables.map((t) => ({
      id: t.id,
      name: physicalTableAdminLabel(t, tables),
      count: rows.filter((r) => r.table_id === t.id).length,
    }))
  }, [tables, rows])

  /** New rows often fail `filtered` when RSVP/search/table filters exclude them. */
  function bumpFiltersAfterCreate() {
    setGuestListChip('all')
    setSearch('')
    setTableFilterId('all')
  }

  async function handleDeleteAttendee(attendeeId: string) {
    if (!window.confirm('Are you sure you want to delete this guest?')) return
    setError(null)
    setSuccess(null)
    try {
      await archiveAttendee(attendeeId)
      setSuccess('Guest archived.')
      setToast({ kind: 'success', message: 'Guest archived.' })
      await loadAll({ showPageLoading: false })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to archive guest.'
      setError(msg)
      setToast({ kind: 'error', message: msg })
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (tableFilterId !== 'all' && r.table_id !== tableFilterId) {
        return false
      }
      if (!rowMatchesGuestListChip(r, guestListChip)) return false

      if (!q) return true
      const gName = r.group_id ? (groupNameById.get(r.group_id) ?? '') : ''
      const tableLabel = r.table_id
        ? (tableNameById.get(r.table_id) ?? '')
        : ''
      const blob = [
        r.full_name,
        r.email ?? '',
        r.phone ?? '',
        r.rsvp_status ?? '',
        gName,
        tableLabel,
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [
    rows,
    search,
    guestListChip,
    tableFilterId,
    groupNameById,
    tableNameById,
  ])

  const groupedLayout = useMemo(() => {
    const roleRank = (m: AttendeeRow) => {
      if (m.is_placeholder || m.party_role === 'placeholder') return 4
      if (m.party_role === 'lead_adult' || m.party_role === 'lead') return 0
      if (m.party_role === 'spouse') return 1
      if (m.party_role === 'child') return 2
      return 3
    }

    const sortMembers = (a: AttendeeRow, b: AttendeeRow) => {
      const d = roleRank(a) - roleRank(b)
      if (d !== 0) return d
      const da = new Date(a.created_at).getTime()
      const db = new Date(b.created_at).getTime()
      if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db
      return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
    }

    const soloGuests = filtered.filter((r) => !r.group_id).sort(sortMembers)
    const blocks: { group: AttendeeGroupRow; members: AttendeeRow[] }[] = []
    for (const g of groups) {
      const members = filtered.filter((r) => r.group_id === g.id).sort(sortMembers)
      if (members.length > 0) blocks.push({ group: g, members })
    }
    return { soloGuests, blocks }
  }, [filtered, groups])

  const partyBlocks = useMemo(() => {
    const blocks = groupedLayout.blocks.map(({ group, members }) => ({
      key: `g:${group.id}`,
      kind: 'group' as const,
      group,
      members,
    }))

    const solo = groupedLayout.soloGuests.map((m) => ({
      key: `s:${m.id}`,
      kind: 'solo' as const,
      members: [m],
      solo: m,
    }))

    // Order parties by the “lead” member creation time for stability
    // (important when converting a solo attendee into a party).
    return [...blocks, ...solo].sort((a, b) => {
      const da = new Date(a.members[0]?.created_at ?? 0).getTime()
      const db = new Date(b.members[0]?.created_at ?? 0).getTime()
      if (da !== db) return da - db
      return a.key.localeCompare(b.key)
    })
  }, [groupedLayout.blocks, groupedLayout.soloGuests])

  function openCreateAttendeeEditor() {
    setAttendeeEditorMode('create')
    setAttendeeEditorParty(null)
    setAttendeeEditorOpen(true)
  }

  function openEditAttendeeEditor(p: (typeof partyBlocks)[number]) {
    setAttendeeEditorMode('edit')
    if (p.kind === 'group') {
      setAttendeeEditorParty({
        key: p.key,
        kind: 'group',
        group: { id: p.group.id, group_name: p.group.group_name },
        members: p.members,
      })
    } else {
      setAttendeeEditorParty({
        key: p.key,
        kind: 'solo',
        members: p.members,
      })
    }
    setAttendeeEditorOpen(true)
  }

  const GRADIENT_BTN =
    'ml-auto inline-flex h-[40px] cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]'

  return (
    <div className="admin-page-shell flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <p className="sr-only" aria-live="polite">
        {error ?? ''} {success ?? ''}
      </p>
      <div className="admin-page-controls flex flex-1 min-h-0 flex-col overflow-hidden">
        <header className="shrink-0">
          <h1 className="admin-page-title text-zinc-900">Attendees</h1>
          <p className="admin-gap-page-title-intro admin-intro">
            Manage guests and parties in one list. Click a row to edit names and RSVP, or add a new party.
          </p>
        </header>

        <section className="admin-gap-intro-first-section flex min-h-0 flex-1 flex-col rounded-t-2xl border-x border-t border-[#ebebeb] bg-white">
          <div className="relative z-[50] shrink-0 rounded-t-2xl border-b border-[#ebebeb] bg-white p-4 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="relative w-full md:w-[300px] md:max-w-[300px]">
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
                    placeholder="Search attendees..."
                    className="h-10 w-full rounded-full border border-[#ebebeb] bg-white pl-8 pr-[12px] text-[14px] font-normal text-[#171717] placeholder:text-[14px] placeholder:text-[#767676] outline-none transition-colors duration-150 ease-out focus:border-zinc-400"
                  />
                </div>

                <AdminFilterRowSegmented<GuestListChip>
                  ariaLabel="Guest list filters"
                  value={guestListChip}
                  onChange={setGuestListChip}
                  className="max-w-full flex-wrap"
                  options={(
                    [
                      ['all', 'All', (n: number) => n],
                      ['yes', 'Attending', (n: number) => n],
                      ['pending', 'Pending', (n: number) => n],
                      ['no', 'Declined', (n: number) => n],
                    ] as const
                  ).map(([id, label, countFn]) => ({
                    value: id,
                    label: (
                      <>
                        {label}
                        <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold tabular-nums text-zinc-700">
                          {countFn(chipCounts[id as GuestListChip])}
                        </span>
                      </>
                    ),
                  }))}
                />

                <AdminSelectDropdown
                  value={tableFilterId}
                  onChange={(v) => setTableFilterId(v)}
                  className="min-w-0"
                  buttonClassName="inline-flex h-10 min-w-[200px] max-w-[280px] shrink-0 cursor-pointer items-center justify-between gap-2 rounded-full border border-[#ebebeb] bg-white px-3 pr-2.5 text-left text-[14px] font-medium text-[#171717] outline-none transition-colors duration-150 ease-out hover:border-zinc-300"
                  options={[
                    { value: 'all', label: 'All tables' },
                    ...tableOptionsWithCounts.map((t) => ({
                      value: t.id,
                      label: `${t.name} (${t.count})`,
                    })),
                  ]}
                />
              </div>

              <button type="button" onClick={openCreateAttendeeEditor} className={GRADIENT_BTN}>
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
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>New attendee</span>
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="admin-scroll-area h-full overflow-y-auto px-4 pb-4 pt-3">
              <div className="admin-content-in space-y-1">
                <div className="grid min-h-[50px] grid-cols-12 gap-x-2 border-b border-[#ebebeb] px-3 pb-2 pt-[10px] text-[14px] font-medium text-[#18181b]">
                  <div className="col-span-4">Party</div>
                  <div className="col-span-1 text-center">Kids</div>
                  <div className="col-span-1 text-center">Extra</div>
                  <div className="col-span-2">Table</div>
                  <div className="col-span-2">Seat</div>
                  <div className="col-span-1">RSVP</div>
                  <div className="col-span-1" aria-hidden />
                </div>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="grid min-h-[50px] grid-cols-12 items-center gap-x-2 rounded-lg px-3 py-1.5">
                    <div className="col-span-4">
                      <span className="admin-skeleton inline-block h-3.5 w-32 rounded-md" />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <span className="admin-skeleton h-6 w-6 rounded-full" />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <span className="admin-skeleton h-6 w-6 rounded-full" />
                    </div>
                    <div className="col-span-2">
                      <span className="admin-skeleton h-3.5 w-16 rounded-md" />
                    </div>
                    <div className="col-span-2">
                      <span className="admin-skeleton h-3.5 w-12 rounded-md" />
                    </div>
                    <div className="col-span-1">
                      <span className="admin-skeleton h-6 w-14 rounded-full" />
                    </div>
                    <div className="col-span-1" />
                  </div>
                ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-scroll-area px-4 pb-4 pt-6 text-[14px] text-zinc-500">
              No attendees match your filters.
            </div>
          ) : (
            <div className="admin-scroll-area admin-content-in flex h-full min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="sticky top-0 z-20 space-y-1 bg-white pb-1 pt-1 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)]">
                  <div className="grid grid-cols-12 gap-x-2 border-b border-[#ebebeb] px-3 pb-2 pt-[10px] text-[14px] font-medium text-[#18181b]">
                    <div className="col-span-4">Party</div>
                    <div className="col-span-1 text-center">Kids</div>
                    <div className="col-span-1 text-center">Extra</div>
                    <div className="col-span-2">Table</div>
                    <div className="col-span-2">Seat</div>
                    <div className="col-span-1">RSVP</div>
                    <div className="col-span-1" aria-hidden />
                  </div>
                  <button
                    type="button"
                    onClick={openCreateAttendeeEditor}
                    className="group/add-row flex min-h-[50px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-dashed border-[#dcdcdc] bg-[#f9fafb] px-3 py-1.5 transition-[background,border-color,color] duration-200 ease-out hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]"
                  >
                    <span
                      className="text-[22px] font-light leading-none text-[#5b38f2] transition-colors duration-200 group-hover/add-row:text-white"
                      aria-hidden
                    >
                      +
                    </span>
                    <span className="text-[14px] font-semibold text-zinc-600 transition-colors duration-200 group-hover/add-row:text-white">
                      Add new attendee
                    </span>
                  </button>
                </div>
                <div className="space-y-1 pt-1">
                {partyBlocks.map((p, partyIndex) => {
                  const kidsCount = computePartyKidsCount(p.members)
                  const extraGuestsCount = computePartyExtraGuestsCount(p.members)
                  const childMembers = childMembersOf(p.members)
                  const extraGuestsMembers = extraGuestsMembersOf(p.members)
                  const parentMembers = parentMembersOf(p.members)
                  const seatSummary = computePartySeatAndTable(p.members, tables)
                  const rsvpBadge = computePartyRsvpBadge(p.members)
                  const partyTitle =
                    p.kind === 'solo'
                      ? p.members[0]?.full_name ?? ''
                      : getPartyTitle(p.members, p.group!)
                  const rowBgClass =
                    partyIndex % 2 === 0
                      ? 'bg-[#fdfdfd] hover:bg-[#fafafa]'
                      : 'bg-[#1f1f1f08] hover:bg-[#ededed]'
                  return (
                    <div
                      key={p.key}
                      className={`grid min-h-[50px] grid-cols-12 items-center gap-x-2 rounded-lg px-3 py-1.5 ${rowBgClass}`}
                    >
                      <button
                        type="button"
                        onClick={() => openEditAttendeeEditor(p)}
                        className="col-span-11 grid cursor-pointer grid-cols-11 items-center gap-x-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
                      >
                        <div className="col-span-4 flex min-w-0 items-center gap-2.5">
                          {parentMembers.length > 0 ? (
                            <MiniAvatarStack members={parentMembers} max={3} />
                          ) : null}
                          <span className="min-w-0 truncate text-[14px] font-medium text-zinc-900">
                            {partyTitle}
                          </span>
                        </div>
                        <div className="col-span-1 flex items-center justify-center text-[13px] text-zinc-600">
                          {kidsCount === 0 ? (
                            '—'
                          ) : (
                            <MiniAvatarStack members={childMembers} max={3} />
                          )}
                        </div>
                        <div className="col-span-1 flex items-center justify-center text-[13px] text-zinc-600">
                          {extraGuestsCount === 0 ? (
                            '—'
                          ) : (
                            <MiniAvatarStack members={extraGuestsMembers} max={3} />
                          )}
                        </div>
                        <div className="col-span-2 text-[14px] font-medium text-zinc-500">
                          {seatSummary.tableLabel}
                        </div>
                        <div className="col-span-2 text-[14px] font-medium text-zinc-500">
                          {seatSummary.seatLabel}
                        </div>
                        <div className="col-span-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[13px] font-semibold ${rsvpBadge.className}`}
                          >
                            {rsvpBadge.text}
                          </span>
                        </div>
                      </button>
                      <div className="col-span-1 flex justify-end">
                        <ArchiveGuestIconButton
                          onClick={(e) => {
                            e.stopPropagation()
                            const firstId = p.members[0]?.id
                            if (firstId) void handleDeleteAttendee(firstId)
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            </div>
          )}
          </div>

          <AttendeeEditorOverlay
            open={attendeeEditorOpen}
            mode={attendeeEditorMode}
            party={attendeeEditorParty}
            onClose={() => setAttendeeEditorOpen(false)}
            onSaved={async () => {
              bumpFiltersAfterCreate()
              await loadAll({ showPageLoading: false })
            }}
            onError={(m) => {
              setError(m)
              setToast({ kind: 'error', message: m })
            }}
            onSuccess={(m) => {
              setSuccess(m)
              setError(null)
              setToast({ kind: 'success', message: m })
            }}
          />
        </section>
      </div>
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
