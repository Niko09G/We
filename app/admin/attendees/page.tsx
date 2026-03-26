'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import {
  createAttendee,
  createPlaceholderAttendee,
  archiveAttendee,
  listAttendeesForAdmin,
  mergeAttendeesFromCsvRows,
  removeAttendeePhotoByPublicUrl,
  updateAttendee,
  updateRsvpForGroup,
  uploadAttendeePhoto,
  type AttendeeRow,
} from '@/lib/admin-attendees'
import {
  createAttendeeGroup,
  deleteAttendeeGroup,
  listAttendeeGroups,
  updateAttendeeGroup,
  type AttendeeGroupRow,
} from '@/lib/admin-attendee-groups'
import { attendeeRowsFromCsv } from '@/lib/attendees-csv'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import { compressAvatarImage } from '@/lib/image-compress'

const RSVP_OPTIONS = [
  { value: '', label: '—' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'pending', label: 'Pending' },
] as const

type GuestListChip = 'all' | 'guests' | 'yes' | 'pending' | 'no'

/** Non-lead party members (kids, +1s, placeholders) — distinct from “hosts” in a party. */
function rowMatchesGuestsChip(r: AttendeeRow): boolean {
  const pr = r.party_role
  if (pr === 'lead_adult' || pr === 'lead' || pr === 'spouse') return false
  return true
}

function isPendingResponseRow(r: AttendeeRow): boolean {
  const s = (r.rsvp_status ?? '').trim().toLowerCase()
  return s === '' || s === 'pending'
}

function rowMatchesGuestListChip(r: AttendeeRow, chip: GuestListChip): boolean {
  switch (chip) {
    case 'all':
      return true
    case 'guests':
      return rowMatchesGuestsChip(r)
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

function sortByName(a: AttendeeRow, b: AttendeeRow) {
  return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
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

/** Space/Enter on row must not steal keys from inputs, selects, or buttons. */
function isInsideFormField(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, select, textarea, button, [contenteditable="true"], option'
      )
    )
  )
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
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[18px] font-light leading-none text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-300"
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
  tableNameById: Map<string, string>
): { tableLabel: string; seatLabel: string } {
  const seated = members.filter(
    (m) => m.table_id != null && m.seat_number != null
  )

  if (seated.length === 0) return { tableLabel: '—', seatLabel: '—' }

  const uniqueTableIds = Array.from(new Set(seated.map((m) => m.table_id)))
  if (uniqueTableIds.length !== 1) return { tableLabel: '—', seatLabel: '—' }

  const tableId = uniqueTableIds[0] as string
  const tableLabel = tableNameById.get(tableId) ?? tableId.slice(0, 8)

  const seatNums = seated
    .map((m) => m.seat_number)
    .filter((n): n is number => n != null)

  const min = Math.min(...seatNums)
  const max = Math.max(...seatNums)
  const seatLabel = seatNums.length === 1 ? String(min) : `${min}–${max}`

  return { tableLabel, seatLabel }
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

  const [search, setSearch] = useState('')
  const [guestListChip, setGuestListChip] = useState<GuestListChip>('all')
  const [tableFilterId, setTableFilterId] = useState<string>('all')
  const [listMode, setListMode] = useState<'flat' | 'grouped'>('grouped')
  const [expandedPartyKeys, setExpandedPartyKeys] = useState<
    Record<string, boolean>
  >({})

  /** Which party row is active (add-member actions); which attendee row shows table/seat/RSVP editors. */
  const [selectedPartyKey, setSelectedPartyKey] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const [csvBusy, setCsvBusy] = useState(false)
  const [csvInfo, setCsvInfo] = useState<string | null>(null)
  const [csvWarnings, setCsvWarnings] = useState<string[]>([])

  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupNotes, setNewGroupNotes] = useState('')
  const [groupCreating, setGroupCreating] = useState(false)

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupEditName, setGroupEditName] = useState('')
  const [groupEditNotes, setGroupEditNotes] = useState('')
  const [groupSaveBusy, setGroupSaveBusy] = useState(false)
  const [partyCreateBusy, setPartyCreateBusy] = useState(false)

  const [placeholderTargetGroupId, setPlaceholderTargetGroupId] = useState<string | null>(
    null
  )
  const [placeholderLabel, setPlaceholderLabel] = useState('Guest')
  const [placeholderBusy, setPlaceholderBusy] = useState(false)

  const [newGuest, setNewGuest] = useState({
    full_name: '',
    email: '',
    phone: '',
    rsvp_status: '' as string,
    group_id: '',
    is_placeholder: false,
  })
  const [createGuestBusy, setCreateGuestBusy] = useState(false)

  const [quickRsvpId, setQuickRsvpId] = useState<string | null>(null)
  const [groupRsvpSelect, setGroupRsvpSelect] = useState<Record<string, string>>({})
  const [groupRsvpBusyId, setGroupRsvpBusyId] = useState<string | null>(null)

  const [partyAddGuestGroupId, setPartyAddGuestGroupId] = useState<string | null>(
    null
  )
  const [partyAddGuestBusy, setPartyAddGuestBusy] = useState(false)
  const [partyAddGuestRole, setPartyAddGuestRole] = useState<
    'spouse' | 'child' | 'guest' | 'placeholder'
  >('guest')
  const [partyAddGuestDraft, setPartyAddGuestDraft] = useState({
    full_name: '',
    email: '',
    phone: '',
    rsvp_status: '' as string,
    is_placeholder: false,
  })

  // Party-first creation: create a new `attendee_groups` party and auto-add
  // lead adult(s) with stable party_role so titles/order remain predictable.
  const [createSolo, setCreateSolo] = useState({
    full_name: '',
    rsvp_status: '' as string,
    email: '',
    phone: '',
  })
  const [createCouple, setCreateCouple] = useState({
    lead1: '',
    lead2: '',
    rsvp_status: '' as string,
    email1: '',
    email2: '',
    phone1: '',
    phone2: '',
  })
  const [createFamily, setCreateFamily] = useState({
    lead1: '',
    lead2: '',
    rsvp_status: '' as string,
    email1: '',
    email2: '',
    phone1: '',
    phone2: '',
  })

  // Streamlined booking-style creation form.
  const [compactCreate, setCompactCreate] = useState({
    leadFullName: '',
    rsvp_status: '' as string,
    email: '',
    phone: '',
    addSpouse: false,
    spouseFullName: '',
    addKids: false,
    childNames: [''],
  })

  const [soloAdd, setSoloAdd] = useState<{
    attendeeId: string
    role: 'spouse' | 'child' | 'guest'
    full_name: string
  } | null>(null)
  const [soloAddBusy, setSoloAddBusy] = useState(false)

  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null)
  const attendeeListRef = useRef<HTMLDivElement | null>(null)

  // Inline control-center editing (fast; avoids full refresh on every change).
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null)
  const [nameDraftById, setNameDraftById] = useState<Record<string, string>>({})
  const [seatDraftById, setSeatDraftById] = useState<Record<string, string>>({})

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

  /** Click outside the attendee table area clears selection. */
  useEffect(() => {
    function onPointerDown(ev: PointerEvent) {
      const el = attendeeListRef.current
      if (!el) return
      const t = ev.target
      if (t instanceof Node && !el.contains(t)) {
        setSelectedPartyKey(null)
        setSelectedMemberId(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) m.set(g.id, g.group_name)
    return m
  }, [groups])

  const tableNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tables) m.set(t.id, t.name)
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
      guests: base.filter((r) => rowMatchesGuestsChip(r)).length,
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
      name: t.name,
      count: rows.filter((r) => r.table_id === t.id).length,
    }))
  }, [tables, rows])

  /** New rows often fail `filtered` when RSVP/search/table filters exclude them. */
  function bumpFiltersAfterCreate() {
    setGuestListChip('all')
    setSearch('')
    setTableFilterId('all')
  }

  function updateRowLocal(
    id: string,
    patch: Partial<AttendeeRow>
  ): void {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        return {
          ...r,
          ...patch,
          updated_at: new Date().toISOString(),
        }
      })
    )
  }

  async function saveInlineFullName(
    attendeeId: string,
    nextValue: string,
    previousValue: string
  ) {
    const trimmed = nextValue.trim()
    if (!trimmed) {
      setError('Full name cannot be empty.')
      setNameDraftById((prev) => {
        const next = { ...prev }
        next[attendeeId] = previousValue
        return next
      })
      return
    }
    if (trimmed === previousValue) {
      setNameDraftById((prev) => {
        const next = { ...prev }
        delete next[attendeeId]
        return next
      })
      return
    }

    setInlineSavingId(attendeeId)
    setError(null)
    try {
      await updateAttendee(attendeeId, { full_name: trimmed })
      updateRowLocal(attendeeId, { full_name: trimmed })
      setSuccess('Saved.')
      setNameDraftById((prev) => {
        const next = { ...prev }
        delete next[attendeeId]
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save name.')
      await loadAll({ showPageLoading: false })
    } finally {
      setInlineSavingId(null)
    }
  }

  async function saveInlineSeatNumber(
    attendeeId: string,
    nextRawValue: string,
    previousValue: number | null
  ) {
    const raw = nextRawValue.trim()
    let next: number | null = null
    if (raw === '') {
      next = null
    } else {
      const n = Number.parseInt(raw, 10)
      if (Number.isNaN(n) || n <= 0) {
        setError('Seat number must be null or greater than 0.')
        setSeatDraftById((prev) => {
          const nextMap = { ...prev }
          nextMap[attendeeId] = previousValue != null ? String(previousValue) : ''
          return nextMap
        })
        return
      }
      next = n
    }

    if (next === previousValue) {
      setSeatDraftById((prev) => {
        const nextMap = { ...prev }
        delete nextMap[attendeeId]
        return nextMap
      })
      return
    }

    setInlineSavingId(attendeeId)
    setError(null)
    try {
      await updateAttendee(attendeeId, { seat_number: next })
      updateRowLocal(attendeeId, { seat_number: next })
      setSuccess('Saved.')
      setSeatDraftById((prev) => {
        const nextMap = { ...prev }
        delete nextMap[attendeeId]
        return nextMap
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save seat.')
      await loadAll({ showPageLoading: false })
    } finally {
      setInlineSavingId(null)
    }
  }

  async function saveInlineGroup(attendeeId: string, nextGroupId: string | null) {
    if ((nextGroupId ?? null) === null) {
      // ok
    }
    setInlineSavingId(attendeeId)
    setError(null)
    try {
      await updateAttendee(attendeeId, { group_id: nextGroupId })
      updateRowLocal(attendeeId, { group_id: nextGroupId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save group.')
      await loadAll({ showPageLoading: false })
    } finally {
      setInlineSavingId(null)
    }
  }

  async function saveInlineTable(attendeeId: string, nextTableId: string | null) {
    setInlineSavingId(attendeeId)
    setError(null)
    try {
      await updateAttendee(attendeeId, { table_id: nextTableId })
      updateRowLocal(attendeeId, { table_id: nextTableId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save table.')
      await loadAll({ showPageLoading: false })
    } finally {
      setInlineSavingId(null)
    }
  }

  async function handleDeleteAttendee(attendeeId: string) {
    if (!window.confirm('Are you sure you want to delete this guest?')) return
    setError(null)
    setSuccess(null)
    setInlineSavingId(attendeeId)
    try {
      await archiveAttendee(attendeeId)
      if (selectedMemberId === attendeeId) {
        setSelectedPartyKey(null)
        setSelectedMemberId(null)
      }
      setNameDraftById((prev) => {
        const next = { ...prev }
        delete next[attendeeId]
        return next
      })
      setSeatDraftById((prev) => {
        const nextMap = { ...prev }
        delete nextMap[attendeeId]
        return nextMap
      })
      setSuccess('Guest archived.')
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive guest.')
    } finally {
      setInlineSavingId(null)
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

  const sortedFlat = useMemo(() => [...filtered].sort(sortByName), [filtered])

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

  async function onCsvSelected(file: File | null) {
    setCsvInfo(null)
    setCsvWarnings([])
    setSuccess(null)
    if (!file) return
    setCsvBusy(true)
    setError(null)
    try {
      const text = await file.text()
      const { rows: parsed, errors: parseErrors } = attendeeRowsFromCsv(text)
      setCsvWarnings(parseErrors)
      if (parsed.length === 0) {
        setCsvInfo(
          parseErrors.length ? 'No valid rows to import.' : 'No data rows to import.'
        )
        return
      }
      const { result } = await mergeAttendeesFromCsvRows(parsed, rows)
      setCsvInfo(
        `Import finished: ${result.inserted} added, ${result.updated} updated` +
          (result.failed ? `, ${result.failed} failed` : '') +
          '. Grouping is unchanged for existing rows.'
      )
      if (result.failed) {
        setError('Some rows failed (duplicate constraint or network). Check data and retry.')
      }
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSV import failed.')
    } finally {
      setCsvBusy(false)
    }
  }

  async function onPhotoPick(attendeeId: string, file: File | null) {
    if (!file) return
    setPhotoBusyId(attendeeId)
    setError(null)
    setSuccess(null)
    try {
      const ok = ['image/jpeg', 'image/png', 'image/webp']
      if (!ok.includes(file.type)) {
        throw new Error('Use JPG, PNG, or WebP.')
      }
      const row = rows.find((r) => r.id === attendeeId)
      const firstName = row?.full_name.trim().split(/\s+/).filter(Boolean)[0] ?? 'attendee'
      const previousPhotoUrl = row?.photo_url ?? null
      const { blob, contentType } = await compressAvatarImage(file)
      const url = await uploadAttendeePhoto({
        attendeeFirstName: firstName,
        blob,
        contentType,
      })
      await updateAttendee(attendeeId, { photo_url: url })
      await removeAttendeePhotoByPublicUrl(previousPhotoUrl)
      setSuccess('Photo updated.')
      updateRowLocal(attendeeId, { photo_url: url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo upload failed.')
      await loadAll({ showPageLoading: false })
    } finally {
      setPhotoBusyId(null)
    }
  }

  async function clearPhoto(attendeeId: string) {
    setPhotoBusyId(attendeeId)
    try {
      const previousPhotoUrl = rows.find((r) => r.id === attendeeId)?.photo_url ?? null
      await updateAttendee(attendeeId, { photo_url: null })
      await removeAttendeePhotoByPublicUrl(previousPhotoUrl)
      setSuccess('Photo removed.')
      updateRowLocal(attendeeId, { photo_url: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove photo.')
      await loadAll({ showPageLoading: false })
    } finally {
      setPhotoBusyId(null)
    }
  }

  async function handleCreateGroup() {
    setGroupCreating(true)
    setError(null)
    setSuccess(null)
    try {
      await createAttendeeGroup({ group_name: newGroupName, notes: newGroupNotes || null })
      setNewGroupName('')
      setNewGroupNotes('')
      setSuccess('Group created.')
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group.')
    } finally {
      setGroupCreating(false)
    }
  }

  function openGroupEdit(g: AttendeeGroupRow) {
    setEditingGroupId(g.id)
    setGroupEditName(g.group_name)
    setGroupEditNotes(g.notes ?? '')
  }

  async function saveGroupEdit() {
    if (!editingGroupId) return
    setGroupSaveBusy(true)
    try {
      await updateAttendeeGroup(editingGroupId, {
        group_name: groupEditName,
        notes: groupEditNotes,
      })
      setEditingGroupId(null)
      setSuccess('Group updated.')
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update group.')
    } finally {
      setGroupSaveBusy(false)
    }
  }

  async function handleDeleteGroup(id: string, name: string) {
    if (
      !window.confirm(
        `Delete group “${name}”? Attendees stay in the roster but are removed from this group.`
      )
    ) {
      return
    }
    try {
      await deleteAttendeeGroup(id)
      setSuccess('Group deleted.')
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete group.')
    }
  }

  async function handleCreatePlaceholder() {
    if (!placeholderTargetGroupId) return
    setPlaceholderBusy(true)
    setError(null)
    try {
      await createPlaceholderAttendee({
        groupId: placeholderTargetGroupId,
        displayLabel: placeholderLabel,
      })
      setPlaceholderTargetGroupId(null)
      setPlaceholderLabel('Guest')
      setSuccess('Placeholder guest added.')
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add placeholder.')
    } finally {
      setPlaceholderBusy(false)
    }
  }

  async function handleCreateGuest() {
    if (!newGuest.full_name.trim()) {
      setError('Full name is required.')
      return
    }
    setCreateGuestBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await createAttendee({
        full_name: newGuest.full_name.trim(),
        email: newGuest.email.trim() || null,
        phone: newGuest.phone.trim() || null,
        rsvp_status: newGuest.rsvp_status.trim() || null,
        group_id: newGuest.group_id.trim() || null,
        is_placeholder: newGuest.is_placeholder,
      })
      setNewGuest({
        full_name: '',
        email: '',
        phone: '',
        rsvp_status: '',
        group_id: '',
        is_placeholder: false,
      })
      setSuccess('Guest created.')
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create guest.')
    } finally {
      setCreateGuestBusy(false)
    }
  }

  async function handleCreateGuestForParty(groupId: string) {
    const nameFromDraft = partyAddGuestDraft.full_name.trim()
    const isPlaceholder = partyAddGuestRole === 'placeholder'
    const full_name = nameFromDraft || (isPlaceholder ? 'Guest' : '')

    if (!full_name) {
      setError('Full name is required.')
      return
    }

    setPartyAddGuestBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const created = await createAttendee({
        full_name,
        email: partyAddGuestDraft.email.trim() || null,
        phone: partyAddGuestDraft.phone.trim() || null,
        rsvp_status: partyAddGuestDraft.rsvp_status.trim() || null,
        group_id: groupId,
        is_placeholder: isPlaceholder,
        party_role: isPlaceholder ? 'placeholder' : partyAddGuestRole,
      })

      bumpFiltersAfterCreate()

      await loadAll({ showPageLoading: false })

      setExpandedPartyKeys((prev) => ({
        ...prev,
        [`g:${groupId}`]: true,
      }))

      setSelectedPartyKey(`g:${groupId}`)
      setSelectedMemberId(created.id)

      setSuccess('Guest added.')
      setPartyAddGuestGroupId(null)
      setPartyAddGuestRole('guest')
      setPartyAddGuestDraft({
        full_name: '',
        email: '',
        phone: '',
        rsvp_status: '',
        is_placeholder: false,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create guest.')
      try {
        await loadAll({ showPageLoading: false })
      } catch {
        /* secondary load failure — primary error already shown */
      }
    } finally {
      setPartyAddGuestBusy(false)
    }
  }

  function firstName(fullName: string): string {
    return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? ''
  }

  async function createSoloParty() {
    const full_name = createSolo.full_name.trim()
    if (!full_name) {
      setError('Full name is required.')
      return
    }
    setPartyCreateBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await createAttendee({
        full_name,
        email: createSolo.email.trim() || null,
        phone: createSolo.phone.trim() || null,
        rsvp_status: createSolo.rsvp_status.trim() || null,
        is_placeholder: false,
        party_role: 'lead',
        group_id: null,
      })
      setSuccess('Solo guest created.')
      setCreateSolo({ full_name: '', email: '', phone: '', rsvp_status: '' })
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create party.')
    } finally {
      setPartyCreateBusy(false)
    }
  }

  async function createCoupleParty() {
    const lead1 = createCouple.lead1.trim()
    const lead2 = createCouple.lead2.trim()
    if (!lead1 || !lead2) {
      setError('Both lead adult names are required.')
      return
    }
    setPartyCreateBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const group_name = `${firstName(lead1)} & ${firstName(lead2)}`
      const group = await createAttendeeGroup({
        group_name,
        notes: null,
      })
      await createAttendee({
        full_name: lead1,
        email: createCouple.email1.trim() || null,
        phone: createCouple.phone1.trim() || null,
        rsvp_status: createCouple.rsvp_status.trim() || null,
        group_id: group.id,
        is_placeholder: false,
        party_role: 'lead',
      })
      await createAttendee({
        full_name: lead2,
        email: createCouple.email2.trim() || null,
        phone: createCouple.phone2.trim() || null,
        rsvp_status: createCouple.rsvp_status.trim() || null,
        group_id: group.id,
        is_placeholder: false,
        party_role: 'spouse',
      })
      setSuccess('Party created.')
      setCreateCouple({
        lead1: '',
        lead2: '',
        rsvp_status: '',
        email1: '',
        email2: '',
        phone1: '',
        phone2: '',
      })
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create party.')
    } finally {
      setPartyCreateBusy(false)
    }
  }

  async function createFamilyParty() {
    const lead1 = createFamily.lead1.trim()
    const lead2 = createFamily.lead2.trim()
    if (!lead1) {
      setError('Lead adult name is required.')
      return
    }
    setPartyCreateBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const group_name = lead2
        ? `${firstName(lead1)} & ${firstName(lead2)}`
        : lead1
      const group = await createAttendeeGroup({
        group_name,
        notes: null,
      })
      await createAttendee({
        full_name: lead1,
        email: createFamily.email1.trim() || null,
        phone: createFamily.phone1.trim() || null,
        rsvp_status: createFamily.rsvp_status.trim() || null,
        group_id: group.id,
        is_placeholder: false,
        party_role: 'lead',
      })
      if (lead2) {
        await createAttendee({
          full_name: lead2,
          email: createFamily.email2.trim() || null,
          phone: createFamily.phone2.trim() || null,
          rsvp_status: createFamily.rsvp_status.trim() || null,
          group_id: group.id,
          is_placeholder: false,
          party_role: 'spouse',
        })
      }
      setSuccess('Party created.')
      setCreateFamily({
        lead1: '',
        lead2: '',
        rsvp_status: '',
        email1: '',
        email2: '',
        phone1: '',
        phone2: '',
      })
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create party.')
    } finally {
      setPartyCreateBusy(false)
    }
  }

  async function createPartyFromCompactForm() {
    const leadFullName = compactCreate.leadFullName.trim()
    if (!leadFullName) {
      setError('Lead guest full name is required.')
      return
    }

    const addSpouse = compactCreate.addSpouse
    const spouseFullName = compactCreate.spouseFullName.trim()
    if (addSpouse && !spouseFullName) {
      setError('Spouse name is required when “Add spouse” is checked.')
      return
    }

    const childNames = compactCreate.childNames
      .map((n) => n.trim())
      .filter(Boolean)
    const addKids = compactCreate.addKids
    if (addKids && childNames.length === 0) {
      setError('Add at least one child name when “Add kids” is checked.')
      return
    }

    setPartyCreateBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const rsvp_status = compactCreate.rsvp_status.trim() || null
      const email = compactCreate.email.trim() || null
      const phone = compactCreate.phone.trim() || null

      // Solo: no attendee_groups row.
      if (!addSpouse && !addKids) {
        const created = await createAttendee({
          full_name: leadFullName,
          email,
          phone,
          rsvp_status,
          is_placeholder: false,
          party_role: 'lead',
          group_id: null,
        })
        bumpFiltersAfterCreate()
        await loadAll({ showPageLoading: false })
        setSelectedPartyKey(`s:${created.id}`)
        setSelectedMemberId(created.id)
        setSuccess('Attendee created.')
      } else {
        const group_name = addSpouse
          ? `${firstName(leadFullName)} & ${firstName(spouseFullName)}`
          : firstName(leadFullName)

        const group = await createAttendeeGroup({
          group_name,
          notes: null,
        })

        const lead = await createAttendee({
          full_name: leadFullName,
          email,
          phone,
          rsvp_status,
          group_id: group.id,
          is_placeholder: false,
          party_role: 'lead',
        })

        if (addSpouse) {
          await createAttendee({
            full_name: spouseFullName,
            email: null,
            phone: null,
            rsvp_status,
            group_id: group.id,
            is_placeholder: false,
            party_role: 'spouse',
          })
        }

        for (const childName of childNames) {
          await createAttendee({
            full_name: childName,
            email: null,
            phone: null,
            rsvp_status,
            group_id: group.id,
            is_placeholder: false,
            party_role: 'child',
          })
        }

        bumpFiltersAfterCreate()
        await loadAll({ showPageLoading: false })
        setSelectedPartyKey(`g:${group.id}`)
        setSelectedMemberId(lead.id)
        setExpandedPartyKeys((prev) => ({
          ...prev,
          [`g:${group.id}`]: true,
        }))

        setSuccess(
          addKids ? (addSpouse ? 'Family created.' : 'Family created.') : 'Couple created.'
        )
      }

      setCompactCreate({
        leadFullName: '',
        rsvp_status: '',
        email: '',
        phone: '',
        addSpouse: false,
        spouseFullName: '',
        addKids: false,
        childNames: [''],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create party.')
      // Ensure we recover to the server state if something went wrong mid-flight.
      await loadAll({ showPageLoading: false })
    } finally {
      setPartyCreateBusy(false)
    }
  }

  async function convertSoloToPartyAndAddMember(
    soloAttendeeId: string,
    role: 'spouse' | 'child' | 'guest',
    name: string
  ) {
    const trimmed = name.trim()
    if (!trimmed) return

    const soloLead = rows.find((r) => r.id === soloAttendeeId) ?? null
    if (!soloLead) {
      setError('Solo attendee not found.')
      return
    }

    setSoloAddBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const leadFullName = soloLead.full_name.trim()
      const rsvp_status = soloLead.rsvp_status ?? null

      const group_name =
        role === 'spouse'
          ? `${firstName(leadFullName)} & ${firstName(trimmed)}`
          : firstName(leadFullName)

      const group = await createAttendeeGroup({
        group_name,
        notes: null,
      })

      await updateAttendee(soloLead.id, {
        group_id: group.id,
        is_placeholder: false,
        party_role: 'lead',
      })

      const created = await createAttendee({
        full_name: trimmed,
        email: null,
        phone: null,
        rsvp_status,
        group_id: group.id,
        is_placeholder: false,
        party_role: role,
      })

      bumpFiltersAfterCreate()

      await loadAll({ showPageLoading: false })

      setSuccess('Party updated.')
      setSoloAdd(null)
      setSelectedPartyKey(`g:${group.id}`)
      setSelectedMemberId(created.id)
      setExpandedPartyKeys((prev) => {
        const next = { ...prev }
        delete next[`s:${soloLead.id}`]
        next[`g:${group.id}`] = true
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update party.')
      await loadAll({ showPageLoading: false })
    } finally {
      setSoloAddBusy(false)
    }
  }

  async function quickRsvpSave(attendeeId: string, value: string) {
    setQuickRsvpId(attendeeId)
    setError(null)
    try {
      const prev = rows.find((r) => r.id === attendeeId) ?? null
      const nextRsvp = value === '' ? null : value
      await updateAttendee(attendeeId, {
        rsvp_status: nextRsvp,
      })
      if (prev) {
        updateRowLocal(attendeeId, { rsvp_status: nextRsvp })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RSVP update failed.')
      // Refresh to recover if our optimistic local state diverged.
      await loadAll({ showPageLoading: false })
    } finally {
      setQuickRsvpId(null)
    }
  }

  async function handleGroupRsvpApply(groupId: string, raw: string) {
    if (!raw) return
    setGroupRsvpBusyId(groupId)
    setError(null)
    setSuccess(null)
    try {
      const rsvp = raw === '__clear__' ? null : raw
      await updateRsvpForGroup(groupId, rsvp)
      setGroupRsvpSelect((s) => ({ ...s, [groupId]: '' }))
      setSuccess('Group RSVP updated.')
      await loadAll({ showPageLoading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update group RSVP.')
      await loadAll({ showPageLoading: false })
    } finally {
      setGroupRsvpBusyId(null)
    }
  }

  return (
    <div className="admin-page-shell">
      <div className="w-full space-y-6">
        <header>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Attendees
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Parties (solo / couple / family) are the seating unit. Add an attendee/party, then manage RSVP, table, seat, and photos directly in the list below.
          </p>
        </header>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            {success}
          </p>
        )}

        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Add attendee / party
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Create a solo guest, couple, or family with one form. Toggle spouse/kids as needed—saving will automatically create the party group and the right set of attendees.
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block text-xs">
              <span className="font-medium text-zinc-500">Lead guest full name</span>
              <input
                value={compactCreate.leadFullName}
                onChange={(e) =>
                  setCompactCreate((s) => ({ ...s, leadFullName: e.target.value }))
                }
                placeholder="e.g. Chris"
                className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>

            <label className="block text-xs">
              <span className="font-medium text-zinc-500">RSVP</span>
              <select
                value={compactCreate.rsvp_status}
                onChange={(e) =>
                  setCompactCreate((s) => ({ ...s, rsvp_status: e.target.value }))
                }
                className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              >
                {RSVP_OPTIONS.map((o) => (
                  <option key={o.value || 'empty'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="font-medium text-zinc-500">Email (optional)</span>
              <input
                type="email"
                value={compactCreate.email}
                onChange={(e) =>
                  setCompactCreate((s) => ({ ...s, email: e.target.value }))
                }
                className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>

            <label className="block text-xs">
              <span className="font-medium text-zinc-500">Phone (optional)</span>
              <input
                value={compactCreate.phone}
                onChange={(e) =>
                  setCompactCreate((s) => ({ ...s, phone: e.target.value }))
                }
                className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>

            <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={compactCreate.addSpouse}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setCompactCreate((s) => ({
                      ...s,
                      addSpouse: checked,
                      spouseFullName: checked ? s.spouseFullName : '',
                    }))
                  }}
                />
                Add spouse
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={compactCreate.addKids}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setCompactCreate((s) => ({
                      ...s,
                      addKids: checked,
                      childNames: checked ? s.childNames : [''],
                    }))
                  }}
                />
                Add kids
              </label>
            </div>

            {compactCreate.addSpouse ? (
              <label className="block text-xs md:col-span-2">
                <span className="font-medium text-zinc-500">Spouse name</span>
                <input
                  value={compactCreate.spouseFullName}
                  onChange={(e) =>
                    setCompactCreate((s) => ({
                      ...s,
                      spouseFullName: e.target.value,
                    }))
                  }
                  placeholder="e.g. Lulu"
                  className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
            ) : null}

            {compactCreate.addKids ? (
              <div className="md:col-span-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Kids
                </div>

                <div className="space-y-2">
                  {compactCreate.childNames.map((name, idx) => (
                    <label key={idx} className="block text-xs">
                      <span className="font-medium text-zinc-500">
                        Child {idx + 1} name
                      </span>
                      <input
                        value={name}
                        onChange={(e) => {
                          const v = e.target.value
                          setCompactCreate((s) => {
                            const next = [...s.childNames]
                            next[idx] = v
                            return { ...s, childNames: next }
                          })
                        }}
                        placeholder="e.g. Ava"
                        className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                      />
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCompactCreate((s) => ({
                      ...s,
                      childNames: [...s.childNames, ''],
                    }))
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                >
                  + Add another child
                </button>
              </div>
            ) : null}

            <div className="md:col-span-2 flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void createPartyFromCompactForm()}
                disabled={
                  partyCreateBusy ||
                  !compactCreate.leadFullName.trim() ||
                  (compactCreate.addSpouse && !compactCreate.spouseFullName.trim()) ||
                  (compactCreate.addKids &&
                    !compactCreate.childNames.some((n) => n.trim().length > 0))
                }
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500"
              >
                {partyCreateBusy
                  ? 'Creating…'
                  : compactCreate.addKids
                    ? 'Create family'
                    : compactCreate.addSpouse
                      ? 'Create couple'
                      : 'Add attendee'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setCompactCreate({
                    leadFullName: '',
                    rsvp_status: '',
                    email: '',
                    phone: '',
                    addSpouse: false,
                    spouseFullName: '',
                    addKids: false,
                    childNames: [''],
                  })
                }
                className="text-sm text-zinc-600 dark:text-zinc-400"
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, table"
                  className="min-w-[min(100%,12rem)] flex-1 rounded-full border border-zinc-200 bg-[#fdfdfd] px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
                />
                <select
                  value={tableFilterId}
                  onChange={(e) => setTableFilterId(e.target.value)}
                  aria-label="Filter by table"
                  className="min-w-[10.5rem] shrink-0 cursor-pointer rounded-full border border-zinc-200 bg-[#fdfdfd] py-2 pl-3.5 pr-9 text-xs font-medium text-zinc-800 outline-none transition-colors focus:border-zinc-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-zinc-500"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.65rem center',
                    backgroundSize: '0.9rem',
                    appearance: 'none',
                  }}
                >
                  <option value="all">All tables</option>
                  {tableOptionsWithCounts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Guest list filters"
            >
              {(
                [
                  ['all', 'All'],
                  ['guests', 'Guests'],
                  ['yes', 'Attending'],
                  ['pending', 'Pending response'],
                  ['no', 'Not attending'],
                ] as const
              ).map(([id, label]) => {
                const active = guestListChip === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setGuestListChip(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'border-zinc-200 bg-[#fdfdfd] text-zinc-700 hover:border-zinc-300 hover:bg-[#fafafa] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80'
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`tabular-nums ${
                        active
                          ? 'text-white/90 dark:text-zinc-800/90'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {chipCounts[id]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-zinc-500">Loading attendees…</p>
          ) : filtered.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">
              No parties match. Try adjusting search/filters, or add an attendee/party above.
            </p>
          ) : (
            <>
            <div className="mt-4" ref={attendeeListRef}>
              <div className="grid grid-cols-12 gap-x-2 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <div className="col-span-4">Name</div>
                <div className="col-span-1 text-center">Kids</div>
                <div className="col-span-1 text-center">Extra</div>
                <div className="col-span-2">Table</div>
                <div className="col-span-2">Seat</div>
                <div className="col-span-1">RSVP</div>
                <div className="col-span-1 text-right" aria-hidden />
              </div>

              <div className="space-y-1">
                {partyBlocks.map((p, partyIndex) => {
                  const isExpanded = expandedPartyKeys[p.key] === true
                  const expandable = p.kind === 'group'

                  const partyTitle =
                    p.kind === 'solo'
                      ? p.members[0]?.full_name ?? ''
                      : getPartyTitle(p.members, p.group!)
                  const kidsCount = computePartyKidsCount(p.members)
                  const extraGuestsCount = computePartyExtraGuestsCount(p.members)
                  const childMembers = childMembersOf(p.members)
                  const extraGuestsMembers = extraGuestsMembersOf(p.members)
                  const parentMembers = parentMembersOf(p.members)
                  const seatSummary = computePartySeatAndTable(
                    p.members,
                    tableNameById
                  )
                  const rsvpBadge = computePartyRsvpBadge(p.members)

                  const partyBgClass =
                    partyIndex % 2 === 0
                      ? 'bg-[#fdfdfd] hover:bg-[#fafafa] dark:bg-zinc-900/45 dark:hover:bg-zinc-800/55'
                      : 'bg-[#1f1f1f08] hover:bg-[#ededed] dark:bg-zinc-950/35 dark:hover:bg-zinc-800/45'

                  const rowSelectedAccent =
                    'shadow-[inset_3px_0_0_0_rgb(63_63_70)] dark:shadow-[inset_3px_0_0_0_rgb(161_161_170)]'

                  if (p.kind === 'solo') {
                    const m = p.members[0]!
                    const showAddForThisSolo = soloAdd?.attendeeId === m.id
                    const isSel =
                      selectedPartyKey === p.key && selectedMemberId === m.id
                    const soloRsvp = computePartyRsvpBadge([m])
                    const tableLabelPlain =
                      m.table_id == null
                        ? '—'
                        : tableNameById.get(m.table_id) ?? m.table_id.slice(0, 8)
                    const seatLabelPlain =
                      m.seat_number == null ? '—' : String(m.seat_number)

                    return (
                      <div
                        key={p.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (
                            selectedPartyKey === p.key &&
                            selectedMemberId === m.id
                          ) {
                            setSelectedPartyKey(null)
                            setSelectedMemberId(null)
                          } else {
                            setSelectedPartyKey(p.key)
                            setSelectedMemberId(m.id)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (isInsideFormField(e.target)) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            if (
                              selectedPartyKey === p.key &&
                              selectedMemberId === m.id
                            ) {
                              setSelectedPartyKey(null)
                              setSelectedMemberId(null)
                            } else {
                              setSelectedPartyKey(p.key)
                              setSelectedMemberId(m.id)
                            }
                          }
                        }}
                        className={`${partyBgClass} cursor-pointer rounded-lg transition-colors ${
                          selectedPartyKey === p.key && selectedMemberId === m.id
                            ? rowSelectedAccent
                            : ''
                        }`}
                      >
                        <div className="grid grid-cols-12 gap-x-2 items-center px-3 py-1.5 text-[12px]">
                          <div
                            className={`col-span-4 flex gap-2.5 min-w-0 ${
                              isSel ? 'items-start' : 'items-center'
                            }`}
                          >
                            <label
                              className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
                              aria-label={`Upload photo for ${m.full_name}`}
                              title="Click to upload photo"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                disabled={photoBusyId === m.id}
                                onChange={(e) =>
                                  void onPhotoPick(
                                    m.id,
                                    e.target.files?.[0] ?? null
                                  )
                                }
                              />
                              {m.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={m.photo_url}
                                  alt=""
                                  className="h-full w-full rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-200">
                                  {getInitials(m.full_name)}
                                </div>
                              )}
                              {photoBusyId === m.id ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/40 text-[10px] font-medium text-white">
                                  …
                                </div>
                              ) : null}
                            </label>

                            <div className="min-w-0 flex-1">
                              {isSel ? (
                                <input
                                  value={nameDraftById[m.id] ?? m.full_name}
                                  onChange={(e) =>
                                    setNameDraftById((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value,
                                    }))
                                  }
                                  onBlur={() =>
                                    void saveInlineFullName(
                                      m.id,
                                      nameDraftById[m.id] ?? m.full_name,
                                      m.full_name
                                    )
                                  }
                                  disabled={inlineSavingId === m.id}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full max-w-[14rem] rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[12px] text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                />
                              ) : (
                                <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100">
                                  {m.full_name || '(Unnamed)'}
                                </span>
                              )}

                              {isSel && m.photo_url ? (
                                <div className="mt-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void clearPhoto(m.id)
                                    }}
                                    className="text-[11px] text-zinc-600 underline dark:text-zinc-400"
                                  >
                                    Clear photo
                                  </button>
                                </div>
                              ) : null}

                              {isSel ? (
                                showAddForThisSolo ? (
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <input
                                      value={soloAdd.full_name}
                                      onChange={(e) =>
                                        setSoloAdd((s) =>
                                          s
                                            ? { ...s, full_name: e.target.value }
                                            : s
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      placeholder={
                                        soloAdd.role === 'spouse'
                                          ? 'Spouse name'
                                          : soloAdd.role === 'child'
                                            ? 'Kid name'
                                            : 'Guest name'
                                      }
                                      className="w-[9.5rem] rounded border border-zinc-300 bg-white px-2 py-1.5 text-[12px] dark:border-zinc-600 dark:bg-zinc-950"
                                    />
                                    <button
                                      type="button"
                                      disabled={
                                        soloAddBusy ||
                                        soloAdd.full_name.trim().length === 0
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        void convertSoloToPartyAndAddMember(
                                          m.id,
                                          soloAdd.role,
                                          soloAdd.full_name
                                        )
                                      }}
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50 dark:bg-emerald-500"
                                    >
                                      {soloAddBusy
                                        ? 'Adding…'
                                        : soloAdd.role === 'spouse'
                                          ? 'Add spouse'
                                          : soloAdd.role === 'child'
                                            ? 'Add kid'
                                            : 'Add guest (+1)'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSoloAdd(null)
                                      }}
                                      className="text-[12px] text-zinc-600 dark:text-zinc-400"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={soloAddBusy}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSoloAdd({
                                          attendeeId: m.id,
                                          role: 'spouse',
                                          full_name: '',
                                        })
                                      }}
                                      className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                                    >
                                      Add spouse
                                    </button>
                                    <button
                                      type="button"
                                      disabled={soloAddBusy}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSoloAdd({
                                          attendeeId: m.id,
                                          role: 'child',
                                          full_name: '',
                                        })
                                      }}
                                      className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                                    >
                                      Add kid
                                    </button>
                                    <button
                                      type="button"
                                      disabled={soloAddBusy}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSoloAdd({
                                          attendeeId: m.id,
                                          role: 'guest',
                                          full_name: '',
                                        })
                                      }}
                                      className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                                    >
                                      Add guest (+1)
                                    </button>
                                  </div>
                                )
                              ) : null}
                            </div>
                          </div>

                          <div className="col-span-1 text-center text-[11px] text-zinc-500">
                            —
                          </div>
                          <div className="col-span-1 text-center text-[11px] text-zinc-500">
                            —
                          </div>

                          <div className="col-span-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                            {isSel ? (
                              <select
                                value={m.table_id ?? ''}
                                disabled={inlineSavingId === m.id}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  void saveInlineTable(
                                    m.id,
                                    e.target.value || null
                                  )
                                }
                                className="max-w-full rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                              >
                                <option value="">—</option>
                                {tables.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              tableLabelPlain
                            )}
                          </div>

                          <div className="col-span-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                            {isSel ? (
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={
                                  seatDraftById[m.id] ??
                                  (m.seat_number != null
                                    ? String(m.seat_number)
                                    : '')
                                }
                                disabled={inlineSavingId === m.id}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setSeatDraftById((prev) => ({
                                    ...prev,
                                    [m.id]: v,
                                  }))
                                }}
                                onBlur={() =>
                                  void saveInlineSeatNumber(
                                    m.id,
                                    seatDraftById[m.id] ??
                                      (m.seat_number != null
                                        ? String(m.seat_number)
                                        : ''),
                                    m.seat_number
                                  )
                                }
                                className="w-full max-w-[5rem] rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 disabled:opacity-60"
                                placeholder="-"
                              />
                            ) : (
                              seatLabelPlain
                            )}
                          </div>

                          <div className="col-span-1 text-[11px]">
                            {isSel ? (
                              <select
                                value={m.rsvp_status ?? ''}
                                disabled={
                                  inlineSavingId === m.id || quickRsvpId === m.id
                                }
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  void quickRsvpSave(m.id, e.target.value)
                                }
                                className="max-w-full rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                              >
                                <option value="">—</option>
                                {RSVP_OPTIONS.map((o) => (
                                  <option key={o.value || 'empty'} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${soloRsvp.className}`}
                              >
                                {soloRsvp.text}
                              </span>
                            )}
                          </div>

                          <div className="col-span-1 flex justify-end">
                            <ArchiveGuestIconButton
                              disabled={inlineSavingId === m.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleDeleteAttendee(m.id)
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={p.key} className={`${partyBgClass} rounded-lg transition-colors`}>
                      <div
                        className={`grid grid-cols-12 gap-x-2 items-center px-3 py-1.5 text-xs transition-colors ${
                          expandable ? 'cursor-pointer select-none' : ''
                        } ${
                          selectedPartyKey === p.key && selectedMemberId === null
                            ? rowSelectedAccent
                            : ''
                        }`}
                        onClick={() => {
                          if (!expandable) return
                          const headerSelected =
                            selectedPartyKey === p.key &&
                            selectedMemberId === null
                          if (headerSelected) {
                            setSelectedPartyKey(null)
                            setSelectedMemberId(null)
                            setExpandedPartyKeys((prev) => ({
                              ...prev,
                              [p.key]: false,
                            }))
                          } else {
                            setSelectedPartyKey(p.key)
                            setSelectedMemberId(null)
                            setExpandedPartyKeys((prev) => ({
                              ...prev,
                              [p.key]: true,
                            }))
                          }
                        }}
                      >
                        <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                          {parentMembers.length > 0 ? (
                            <MiniAvatarStack members={parentMembers} max={3} />
                          ) : null}
                          <span className="min-w-0 truncate font-medium leading-tight text-zinc-900 dark:text-zinc-100">
                            {partyTitle}
                          </span>
                        </div>

                        <div className="col-span-1 flex items-center justify-center text-[11px] text-zinc-600 dark:text-zinc-300">
                          {kidsCount === 0 ? (
                            '—'
                          ) : (
                            <MiniAvatarStack members={childMembers} max={3} />
                          )}
                        </div>

                        <div className="col-span-1 flex items-center justify-center text-[11px] text-zinc-600 dark:text-zinc-300">
                          {extraGuestsCount === 0 ? (
                            '—'
                          ) : (
                            <MiniAvatarStack members={extraGuestsMembers} max={3} />
                          )}
                        </div>

                        <div className="col-span-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                          {seatSummary.tableLabel}
                        </div>
                        <div className="col-span-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                          {seatSummary.seatLabel}
                        </div>

                        <div className="col-span-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${rsvpBadge.className}`}
                          >
                            {rsvpBadge.text}
                          </span>
                        </div>
                        <div className="col-span-1 text-right text-[11px] text-zinc-400">
                          —
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="ml-3 border-l border-zinc-200/90 pl-3 dark:border-zinc-700/90">
                          {p.members.map((m) => {
                            const memSel =
                              selectedPartyKey === p.key &&
                              selectedMemberId === m.id
                            const memRsvp = computePartyRsvpBadge([m])
                            const tablePlain =
                              m.table_id == null
                                ? '—'
                                : tableNameById.get(m.table_id) ??
                                  m.table_id.slice(0, 8)
                            const seatPlain =
                              m.seat_number == null
                                ? '—'
                                : String(m.seat_number)
                            const isExtraMember =
                              m.party_role === 'guest' ||
                              m.party_role === 'placeholder' ||
                              (Boolean(m.is_placeholder) &&
                                m.party_role !== 'child')

                            return (
                              <div
                                key={m.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (
                                    selectedPartyKey === p.key &&
                                    selectedMemberId === m.id
                                  ) {
                                    setSelectedPartyKey(null)
                                    setSelectedMemberId(null)
                                  } else {
                                    setSelectedPartyKey(p.key)
                                    setSelectedMemberId(m.id)
                                    setExpandedPartyKeys((prev) => ({
                                      ...prev,
                                      [p.key]: true,
                                    }))
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (isInsideFormField(e.target)) return
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    if (
                                      selectedPartyKey === p.key &&
                                      selectedMemberId === m.id
                                    ) {
                                      setSelectedPartyKey(null)
                                      setSelectedMemberId(null)
                                    } else {
                                      setSelectedPartyKey(p.key)
                                      setSelectedMemberId(m.id)
                                      setExpandedPartyKeys((prev) => ({
                                        ...prev,
                                        [p.key]: true,
                                      }))
                                    }
                                  }
                                }}
                                className={`grid cursor-pointer grid-cols-12 gap-x-2 items-center px-3 py-2 text-[12px] ${
                                  memSel
                                    ? 'bg-violet-50/80 dark:bg-violet-950/20'
                                    : ''
                                }`}
                              >
                                <div
                                  className={`col-span-4 flex gap-2.5 min-w-0 ${
                                    memSel ? 'items-start' : 'items-center'
                                  }`}
                                >
                                  <label
                                    className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
                                    aria-label={`Upload photo for ${m.full_name}`}
                                    title="Click to upload photo"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      className="hidden"
                                      disabled={photoBusyId === m.id}
                                      onChange={(e) =>
                                        void onPhotoPick(
                                          m.id,
                                          e.target.files?.[0] ?? null
                                        )
                                      }
                                    />
                                    {m.photo_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={m.photo_url}
                                        alt=""
                                        className="h-full w-full rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-200">
                                        {getInitials(m.full_name)}
                                      </div>
                                    )}
                                    {photoBusyId === m.id ? (
                                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/40 text-[10px] font-medium text-white">
                                        …
                                      </div>
                                    ) : null}
                                  </label>

                                  <div className="min-w-0 flex-1">
                                    {memSel ? (
                                      <input
                                        value={nameDraftById[m.id] ?? m.full_name}
                                        onChange={(e) =>
                                          setNameDraftById((prev) => ({
                                            ...prev,
                                            [m.id]: e.target.value,
                                          }))
                                        }
                                        onBlur={() =>
                                          void saveInlineFullName(
                                            m.id,
                                            nameDraftById[m.id] ?? m.full_name,
                                            m.full_name
                                          )
                                        }
                                        disabled={inlineSavingId === m.id}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full max-w-[14rem] rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[12px] text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                      />
                                    ) : (
                                      <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-100">
                                        {m.full_name || '(Unnamed)'}
                                      </span>
                                    )}
                                    {memSel && m.photo_url ? (
                                      <div className="mt-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void clearPhoto(m.id)
                                          }}
                                          className="text-[11px] text-zinc-600 underline dark:text-zinc-400"
                                        >
                                          Clear photo
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="col-span-1 flex items-center justify-center text-[11px] text-zinc-600 dark:text-zinc-300">
                                  {m.party_role === 'child' ? (
                                    <MiniAvatarStack members={[m]} max={1} />
                                  ) : (
                                    '—'
                                  )}
                                </div>

                                <div className="col-span-1 flex items-center justify-center text-[11px] text-zinc-600 dark:text-zinc-300">
                                  {isExtraMember ? (
                                    <MiniAvatarStack members={[m]} max={1} />
                                  ) : (
                                    '—'
                                  )}
                                </div>

                                <div className="col-span-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                                  {memSel ? (
                                    <select
                                      value={m.table_id ?? ''}
                                      disabled={inlineSavingId === m.id}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        void saveInlineTable(
                                          m.id,
                                          e.target.value || null
                                        )
                                      }
                                      className="max-w-full rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                                    >
                                      <option value="">—</option>
                                      {tables.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    tablePlain
                                  )}
                                </div>

                                <div className="col-span-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                                  {memSel ? (
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={
                                        seatDraftById[m.id] ??
                                        (m.seat_number != null
                                          ? String(m.seat_number)
                                          : '')
                                      }
                                      disabled={inlineSavingId === m.id}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const v = e.target.value
                                        setSeatDraftById((prev) => ({
                                          ...prev,
                                          [m.id]: v,
                                        }))
                                      }}
                                      onBlur={() =>
                                        void saveInlineSeatNumber(
                                          m.id,
                                          seatDraftById[m.id] ??
                                            (m.seat_number != null
                                              ? String(m.seat_number)
                                              : ''),
                                          m.seat_number
                                        )
                                      }
                                      className="w-full max-w-[5rem] rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 disabled:opacity-60"
                                      placeholder="-"
                                    />
                                  ) : (
                                    seatPlain
                                  )}
                                </div>

                                <div className="col-span-1 text-[11px]">
                                  {memSel ? (
                                    <select
                                      value={m.rsvp_status ?? ''}
                                      disabled={inlineSavingId === m.id}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        void quickRsvpSave(m.id, e.target.value)
                                      }
                                      className="max-w-full rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                                    >
                                      <option value="">—</option>
                                      {RSVP_OPTIONS.map((o) => (
                                        <option
                                          key={o.value || 'empty'}
                                          value={o.value}
                                        >
                                          {o.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span
                                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${memRsvp.className}`}
                                    >
                                      {memRsvp.text}
                                    </span>
                                  )}
                                </div>

                                <div className="col-span-1 flex justify-end">
                                  <ArchiveGuestIconButton
                                    disabled={inlineSavingId === m.id}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleDeleteAttendee(m.id)
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}

                          {p.kind === 'group' && selectedPartyKey === p.key ? (
                            <div className="px-3 py-2 pt-3">
                              <div className="flex flex-wrap gap-2">
                                {partyAddGuestGroupId === p.group.id ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPartyAddGuestGroupId(null)
                                      }}
                                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPartyAddGuestGroupId(p.group.id)
                                        setPartyAddGuestRole('spouse')
                                        setPartyAddGuestDraft({
                                          full_name: '',
                                          email: '',
                                          phone: '',
                                          rsvp_status: '',
                                          is_placeholder: false,
                                        })
                                      }}
                                      className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                                    >
                                      Add spouse
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPartyAddGuestGroupId(p.group.id)
                                        setPartyAddGuestRole('child')
                                        setPartyAddGuestDraft({
                                          full_name: '',
                                          email: '',
                                          phone: '',
                                          rsvp_status: '',
                                          is_placeholder: false,
                                        })
                                      }}
                                      className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                                    >
                                      Add kid
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPartyAddGuestGroupId(p.group.id)
                                        setPartyAddGuestRole('guest')
                                        setPartyAddGuestDraft({
                                          full_name: '',
                                          email: '',
                                          phone: '',
                                          rsvp_status: '',
                                          is_placeholder: false,
                                        })
                                      }}
                                      className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                                    >
                                      Add guest (+1)
                                    </button>
                                  </>
                                )}
                              </div>

                              {partyAddGuestGroupId === p.group.id ? (
                                <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="block text-xs sm:col-span-2">
                                      <span className="font-medium text-zinc-500">
                                        Full name
                                      </span>
                                      <input
                                        value={partyAddGuestDraft.full_name}
                                        onChange={(e) =>
                                          setPartyAddGuestDraft((s) => ({
                                            ...s,
                                            full_name: e.target.value,
                                          }))
                                        }
                                        placeholder="Guest name"
                                        className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                                      />
                                    </label>

                                    <label className="block text-xs">
                                      <span className="font-medium text-zinc-500">
                                        RSVP
                                      </span>
                                      <select
                                        value={partyAddGuestDraft.rsvp_status}
                                        onChange={(e) =>
                                          setPartyAddGuestDraft((s) => ({
                                            ...s,
                                            rsvp_status: e.target.value,
                                          }))
                                        }
                                        className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                                      >
                                        {RSVP_OPTIONS.map((o) => (
                                          <option
                                            key={o.value || 'empty'}
                                            value={o.value}
                                          >
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        void handleCreateGuestForParty(
                                          p.group.id
                                        )
                                      }}
                                      disabled={
                                        partyAddGuestBusy ||
                                        partyAddGuestDraft.full_name
                                          .trim().length === 0
                                      }
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500"
                                    >
                                      {partyAddGuestBusy
                                        ? 'Adding…'
                                        : partyAddGuestRole === 'child'
                                          ? 'Add kid'
                                          : partyAddGuestRole === 'spouse'
                                            ? 'Add spouse'
                                            : 'Add guest (+1)'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPartyAddGuestGroupId(null)
                                        setPartyAddGuestDraft({
                                          full_name: '',
                                          email: '',
                                          phone: '',
                                          rsvp_status: '',
                                          is_placeholder: false,
                                        })
                                      }}
                                      className="text-sm text-zinc-600 dark:text-zinc-400"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
