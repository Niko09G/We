import type { AttendeeRow } from '@/lib/admin-attendees'
import type { AttendeeGroupRow } from '@/lib/admin-attendee-groups'

export type SeatingUpdate = {
  id: string
  table_id: string | null
  seat_number: number | null
}

export type SeatingParty = {
  key: string
  groupId: string | null
  title: string
  members: AttendeeRow[]
  /** Same table for all members, or null if unassigned / inconsistent */
  uniformTableId: string | null
  splitWarning: boolean
  minSeat: number | null
  maxSeat: number | null
}

function sortMembersForSeating(a: AttendeeRow, b: AttendeeRow): number {
  const roleRank = (m: AttendeeRow) => {
    if (m.is_placeholder || m.party_role === 'placeholder') return 4
    if (m.party_role === 'lead_adult' || m.party_role === 'lead') return 0
    if (m.party_role === 'spouse') return 1
    if (m.party_role === 'child') return 2
    return 3
  }
  const d = roleRank(a) - roleRank(b)
  if (d !== 0) return d
  const da = new Date(a.created_at).getTime()
  const db = new Date(b.created_at).getTime()
  if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db
  return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}

function getPartyTitle(members: AttendeeRow[], group: AttendeeGroupRow): string {
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

export function computePartyKidsCount(members: AttendeeRow[]): number {
  return members.filter((m) => m.party_role === 'child').length
}

export function computePartyExtraGuestsCount(members: AttendeeRow[]): number {
  return members.filter((m) => {
    if (m.party_role === 'guest') return true
    if (m.party_role === 'placeholder') return true
    if (m.is_placeholder && m.party_role !== 'child') return true
    return false
  }).length
}

function partyKeyForRow(r: AttendeeRow): string {
  return r.group_id ? `g:${r.group_id}` : `s:${r.id}`
}

function analyzeParty(
  key: string,
  groupId: string | null,
  members: AttendeeRow[],
  group: AttendeeGroupRow | null
): SeatingParty {
  const sorted = [...members].sort(sortMembersForSeating)
  const tableIds = sorted.map((m) => m.table_id)
  const nonNull = tableIds.filter((id): id is string => id != null)
  const splitWarning =
    new Set(nonNull).size > 1 ||
    (nonNull.length > 0 && nonNull.length !== sorted.length)

  const uniformTableId = splitWarning
    ? null
    : nonNull.length === 0
      ? null
      : nonNull[0]!

  const seats = sorted
    .map((m) => m.seat_number)
    .filter((n): n is number => n != null)
  const minSeat = seats.length ? Math.min(...seats) : null
  const maxSeat = seats.length ? Math.max(...seats) : null

  const title =
    groupId && group
      ? getPartyTitle(sorted, group)
      : sorted[0]?.full_name || '(Unnamed)'

  return {
    key,
    groupId,
    title,
    members: sorted,
    uniformTableId,
    splitWarning,
    minSeat,
    maxSeat,
  }
}

export function buildSeatingParties(
  rows: AttendeeRow[],
  groups: AttendeeGroupRow[]
): SeatingParty[] {
  const out: SeatingParty[] = []

  for (const r of rows) {
    if (!r.group_id) {
      out.push(
        analyzeParty(`s:${r.id}`, null, [r], null)
      )
    }
  }

  for (const g of groups) {
    const members = rows.filter((r) => r.group_id === g.id)
    if (members.length === 0) continue
    out.push(analyzeParty(`g:${g.id}`, g.id, members, g))
  }

  out.sort((a, b) => {
    const da = new Date(a.members[0]?.created_at ?? 0).getTime()
    const db = new Date(b.members[0]?.created_at ?? 0).getTime()
    if (da !== db) return da - db
    return a.key.localeCompare(b.key)
  })

  return out
}

function cloneRows(rows: AttendeeRow[]): AttendeeRow[] {
  return rows.map((r) => ({ ...r }))
}

function countOccupancy(
  rows: AttendeeRow[],
  tableId: string,
  excludeMemberIds: Set<string>
): number {
  return rows.filter(
    (r) => r.table_id === tableId && !excludeMemberIds.has(r.id)
  ).length
}

/** Stored in `tables.page_config` — drag row order for the admin planner (not guest UI). */
const SEATING_PARTY_KEY_ORDER = 'seating_party_key_order'

export function readPartyKeyOrderFromPageConfig(page_config: unknown): string[] | null {
  if (!page_config || typeof page_config !== 'object' || Array.isArray(page_config)) return null
  const raw = (page_config as Record<string, unknown>)[SEATING_PARTY_KEY_ORDER]
  if (!Array.isArray(raw)) return null
  return raw.filter((x): x is string => typeof x === 'string')
}

export function mergePartyKeyOrderIntoPageConfig(
  page_config: unknown | null,
  partyKeyOrder: string[]
): Record<string, unknown> {
  const base =
    page_config && typeof page_config === 'object' && !Array.isArray(page_config)
      ? { ...(page_config as Record<string, unknown>) }
      : {}
  base[SEATING_PARTY_KEY_ORDER] = partyKeyOrder
  return base
}

function computePartyKeysFallbackOrder(rows: AttendeeRow[], tableId: string): string[] {
  const onTable = rows.filter((r) => r.table_id === tableId)
  const keyToMembers = new Map<string, AttendeeRow[]>()
  for (const r of onTable) {
    const k = partyKeyForRow(r)
    if (!keyToMembers.has(k)) keyToMembers.set(k, [])
    keyToMembers.get(k)!.push(r)
  }
  const entries = [...keyToMembers.entries()].map(([key, members]) => {
    const seats = members
      .map((m) => m.seat_number)
      .filter((n): n is number => n != null)
    const minSeat = seats.length ? Math.min(...seats) : 999999
    return { key, minSeat }
  })
  entries.sort((a, b) => a.minSeat - b.minSeat || a.key.localeCompare(b.key))
  return entries.map((e) => e.key)
}

/**
 * Party keys on this table. When `preferredOrder` is set (from `page_config`), it defines
 * planner row order; remaining keys append in fallback order (min seat, then key).
 */
export function partyKeysOnTableOrdered(
  rows: AttendeeRow[],
  tableId: string,
  preferredOrder?: string[] | null
): string[] {
  const fallback = computePartyKeysFallbackOrder(rows, tableId)
  if (!preferredOrder?.length) return fallback

  const present = new Set(fallback)
  const out: string[] = []
  for (const k of preferredOrder) {
    if (present.has(k)) {
      out.push(k)
      present.delete(k)
    }
  }
  for (const k of fallback) {
    if (present.has(k)) out.push(k)
  }
  return out
}

export type SeatingLaneOrderPatch = { tableId: string; partyKeyOrder: string[] }

function computeReorderedPartyKeys(
  keys: string[],
  partyKey: string,
  insertBeforePartyKey: string | null
): string[] {
  const dragIdx = keys.indexOf(partyKey)
  if (dragIdx < 0) return keys
  if (insertBeforePartyKey != null && insertBeforePartyKey === partyKey) return keys

  const next = [...keys]
  next.splice(dragIdx, 1)
  if (insertBeforePartyKey == null) {
    next.push(partyKey)
    return next
  }
  const targetIdx = next.indexOf(insertBeforePartyKey)
  if (targetIdx < 0) {
    next.push(partyKey)
    return next
  }
  next.splice(targetIdx, 0, partyKey)
  return next
}

function insertPartyKeyIntoLaneOrder(
  baseOrder: string[],
  partyKey: string,
  insertBeforePartyKey: string | null
): string[] {
  const without = baseOrder.filter((k) => k !== partyKey)
  if (insertBeforePartyKey == null) {
    return [...without, partyKey]
  }
  const idx = without.indexOf(insertBeforePartyKey)
  if (idx < 0) {
    return [...without, partyKey]
  }
  const next = [...without]
  next.splice(idx, 0, partyKey)
  return next
}

/** Assign contiguous seats 1..N following party key order. */
export function renumberTableSeats(
  rows: AttendeeRow[],
  tableId: string,
  partyKeysInOrder: string[]
): void {
  let seat = 1
  for (const pk of partyKeysInOrder) {
    let members: AttendeeRow[]
    if (pk.startsWith('s:')) {
      const id = pk.slice(2)
      members = rows.filter((r) => r.id === id && r.table_id === tableId)
    } else {
      const gid = pk.slice(2)
      members = rows.filter((r) => r.group_id === gid && r.table_id === tableId)
    }
    members = [...members].sort(sortMembersForSeating)
    for (const m of members) {
      const row = rows.find((x) => x.id === m.id)
      if (row && row.table_id === tableId) {
        row.seat_number = seat++
      }
    }
  }
}

export function diffSeating(
  before: AttendeeRow[],
  after: AttendeeRow[]
): SeatingUpdate[] {
  const beforeById = new Map(before.map((r) => [r.id, r]))
  const updates: SeatingUpdate[] = []
  for (const r of after) {
    const o = beforeById.get(r.id)
    if (!o) continue
    if (o.table_id !== r.table_id || o.seat_number !== r.seat_number) {
      updates.push({
        id: r.id,
        table_id: r.table_id,
        seat_number: r.seat_number,
      })
    }
  }
  return updates
}

export function planAssignPartyToTable(
  before: AttendeeRow[],
  partyKey: string,
  targetTableId: string,
  capacity: number
): { updates: SeatingUpdate[]; error?: string } {
  const partyMembers = new Map<string, AttendeeRow[]>()
  for (const r of before) {
    const k = partyKeyForRow(r)
    if (k !== partyKey) continue
    if (!partyMembers.has(k)) partyMembers.set(k, [])
    partyMembers.get(k)!.push(r)
  }
  const members = partyMembers.get(partyKey)
  if (!members?.length) {
    return { updates: [], error: 'Party not found.' }
  }

  const tableIds = new Set(members.map((m) => m.table_id).filter(Boolean) as string[])
  const split =
    tableIds.size > 1 ||
    (members.some((m) => m.table_id != null) &&
      members.some((m) => m.table_id == null))
  if (split) {
    return {
      updates: [],
      error:
        'This party has inconsistent table assignments. Fix on the Attendees page first.',
    }
  }

  const sourceTableId = members[0]!.table_id
  const memberIds = new Set(members.map((m) => m.id))
  const partySize = members.length

  if (sourceTableId === targetTableId) {
    return { updates: [], error: undefined }
  }

  const usedTarget = countOccupancy(before, targetTableId, memberIds)
  if (usedTarget + partySize > capacity) {
    return {
      updates: [],
      error: `Not enough seats at this table (${usedTarget} used, ${capacity} capacity, party needs ${partySize}).`,
    }
  }

  const next = cloneRows(before)
  for (const id of memberIds) {
    const r = next.find((x) => x.id === id)
    if (r) {
      r.table_id = targetTableId
      r.seat_number = null
    }
  }

  // Main planner no longer repacks seat_number — precise seats are set in the large overlay only.
  return { updates: diffSeating(before, next), error: undefined }
}

export function planUnassignParty(
  before: AttendeeRow[],
  partyKey: string,
  orderByTableId: Map<string, string[]>
): { updates: SeatingUpdate[]; lanePatches: SeatingLaneOrderPatch[]; error?: string } {
  const memberIds = new Set<string>()
  const sourceTables = new Set<string>()
  for (const r of before) {
    if (partyKeyForRow(r) === partyKey) {
      memberIds.add(r.id)
      if (r.table_id) sourceTables.add(r.table_id)
    }
  }
  if (memberIds.size === 0) {
    return { updates: [], lanePatches: [], error: 'Party not found.' }
  }

  const next = cloneRows(before)
  for (const id of memberIds) {
    const r = next.find((x) => x.id === id)
    if (r) {
      r.table_id = null
      r.seat_number = null
    }
  }

  const lanePatches: SeatingLaneOrderPatch[] = []
  for (const tid of sourceTables) {
    const hint = orderByTableId.get(tid)
    const cur = partyKeysOnTableOrdered(before, tid, hint)
    lanePatches.push({ tableId: tid, partyKeyOrder: cur.filter((k) => k !== partyKey) })
  }

  return { updates: diffSeating(before, next), lanePatches, error: undefined }
}

export function planMovePartyOnTable(
  before: AttendeeRow[],
  tableId: string,
  partyKey: string,
  direction: 'up' | 'down',
  orderByTableId: Map<string, string[]>
): { updates: SeatingUpdate[]; lanePatches: SeatingLaneOrderPatch[]; error?: string } {
  const hint = orderByTableId.get(tableId)
  const keys = partyKeysOnTableOrdered(before, tableId, hint)
  const i = keys.indexOf(partyKey)
  if (i < 0) {
    return { updates: [], lanePatches: [], error: 'Party is not on this table.' }
  }
  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= keys.length) {
    return { updates: [], lanePatches: [], error: undefined }
  }
  const swapped = [...keys]
  ;[swapped[i], swapped[j]] = [swapped[j]!, swapped[i]!]
  return {
    updates: [],
    lanePatches: [{ tableId, partyKeyOrder: swapped }],
    error: undefined,
  }
}

/**
 * Drag/drop: assign party to `targetTableId` (clears their seat numbers), merge into lane order.
 */
export function planDropPartyAtTablePosition(
  before: AttendeeRow[],
  partyKey: string,
  targetTableId: string,
  capacity: number,
  insertBeforePartyKey: string | null,
  orderByTableId: Map<string, string[]>
): { updates: SeatingUpdate[]; lanePatches: SeatingLaneOrderPatch[]; error?: string } {
  const memberRows = before.filter((r) => partyKeyForRow(r) === partyKey)
  const sourceTableId =
    memberRows.length && memberRows.every((r) => r.table_id === memberRows[0]!.table_id)
      ? memberRows[0]!.table_id
      : memberRows.find((r) => r.table_id != null)?.table_id ?? null

  const assignRes = planAssignPartyToTable(before, partyKey, targetTableId, capacity)
  if (assignRes.error) {
    return { updates: [], lanePatches: [], error: assignRes.error }
  }

  const lanePatches: SeatingLaneOrderPatch[] = []
  const targetHint = orderByTableId.get(targetTableId)
  const targetBase = partyKeysOnTableOrdered(before, targetTableId, targetHint)
  lanePatches.push({
    tableId: targetTableId,
    partyKeyOrder: insertPartyKeyIntoLaneOrder(targetBase, partyKey, insertBeforePartyKey),
  })

  if (sourceTableId && sourceTableId !== targetTableId) {
    const sourceHint = orderByTableId.get(sourceTableId)
    const sourceBase = partyKeysOnTableOrdered(before, sourceTableId, sourceHint)
    lanePatches.push({
      tableId: sourceTableId,
      partyKeyOrder: sourceBase.filter((k) => k !== partyKey),
    })
  }

  return { updates: assignRes.updates, lanePatches, error: undefined }
}

/** Reorder party rows on the table (lane order only — no seat_number writes). */
export function planReorderPartyInTable(
  before: AttendeeRow[],
  tableId: string,
  partyKey: string,
  insertBeforePartyKey: string | null,
  orderByTableId: Map<string, string[]>
): { updates: SeatingUpdate[]; lanePatches: SeatingLaneOrderPatch[]; error?: string } {
  const hint = orderByTableId.get(tableId)
  const cur = partyKeysOnTableOrdered(before, tableId, hint)
  return {
    updates: [],
    lanePatches: [
      {
        tableId,
        partyKeyOrder: computeReorderedPartyKeys(cur, partyKey, insertBeforePartyKey),
      },
    ],
    error: undefined,
  }
}
