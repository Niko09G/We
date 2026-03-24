import { v4 as uuidv4 } from 'uuid'

import { supabase } from '@/lib/supabase/client'
import type { ParsedAttendeeRow } from '@/lib/attendees-csv'
import {
  normalizeAttendeeEmail,
  normalizeAttendeeName,
} from '@/lib/attendees-csv'

export type AttendeeRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  rsvp_status: string | null
  table_id: string | null
  seat_number: number | null
  group_id: string | null
  is_placeholder: boolean
  party_role: string | null
  photo_url: string | null
  checked_in_at: string | null
  gift_amount_cents: number | null
  created_at: string
  updated_at: string
}

const SELECT =
  'id,full_name,email,phone,rsvp_status,table_id,seat_number,group_id,is_placeholder,party_role,photo_url,checked_in_at,gift_amount_cents,created_at,updated_at'

const BUCKET = 'attendees'

/** Normalize DB row so client state always matches listAttendeesForAdmin(). */
export function normalizeAttendeeRow(row: AttendeeRow): AttendeeRow {
  const r = row
  return {
    ...r,
    group_id: r.group_id ?? null,
    is_placeholder: Boolean(r.is_placeholder),
    party_role: r.party_role ?? null,
  }
}

export async function listAttendeesForAdmin(): Promise<AttendeeRow[]> {
  const { data, error } = await supabase
    .from('attendees')
    .select(SELECT)
    .order('full_name')
    .eq('is_archived', false)

  if (error) throw new Error(error.message || 'Failed to load attendees.')
  return (data ?? []).map((row) => normalizeAttendeeRow(row as AttendeeRow))
}

export type AttendeeUpdateInput = {
  full_name?: string
  email?: string | null
  phone?: string | null
  rsvp_status?: string | null
  table_id?: string | null
  seat_number?: number | null
  group_id?: string | null
  is_placeholder?: boolean
  party_role?: string | null
  photo_url?: string | null
  /** ISO timestamp; null clears check-in */
  checked_in_at?: string | null
  /** Whole cents; null clears */
  gift_amount_cents?: number | null
}

export async function updateAttendee(
  id: string,
  patch: AttendeeUpdateInput
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.full_name !== undefined) {
    const n = patch.full_name.trim()
    if (!n) throw new Error('Full name is required.')
    row.full_name = n
  }
  if (patch.email !== undefined) {
    const e = patch.email?.trim()
    row.email = e ? normalizeAttendeeEmail(e) : null
  }
  if (patch.phone !== undefined) {
    const p = patch.phone?.trim()
    row.phone = p || null
  }
  if (patch.rsvp_status !== undefined) {
    row.rsvp_status =
      patch.rsvp_status === '' || patch.rsvp_status == null
        ? null
        : patch.rsvp_status
  }
  if (patch.table_id !== undefined) row.table_id = patch.table_id || null
  if (patch.seat_number !== undefined) {
    const s = patch.seat_number
    row.seat_number =
      s === null || s === undefined || Number.isNaN(s) ? null : Math.trunc(s)
  }
  if (patch.group_id !== undefined) row.group_id = patch.group_id || null
  if (patch.is_placeholder !== undefined) row.is_placeholder = patch.is_placeholder
  if (patch.party_role !== undefined) row.party_role = patch.party_role || null
  if (patch.photo_url !== undefined) row.photo_url = patch.photo_url || null
  if (patch.checked_in_at !== undefined) {
    row.checked_in_at =
      patch.checked_in_at === '' || patch.checked_in_at == null
        ? null
        : patch.checked_in_at
  }
  if (patch.gift_amount_cents !== undefined) {
    const g = patch.gift_amount_cents
    row.gift_amount_cents =
      g === null || g === undefined || Number.isNaN(g) ? null : Math.trunc(g)
  }

  if (Object.keys(row).length === 0) return

  const { error } = await supabase.from('attendees').update(row).eq('id', id)

  if (error) {
    if (error.code === '23505')
      throw new Error('Another attendee already uses this email.')
    throw new Error(error.message || 'Failed to update attendee.')
  }
}

/** Create a guest from admin (real attendee path; set is_placeholder for TBD). */
export async function createAttendee(input: {
  full_name: string
  email?: string | null
  phone?: string | null
  rsvp_status?: string | null
  group_id?: string | null
  is_placeholder?: boolean
  party_role?: string | null
}): Promise<AttendeeRow> {
  const full_name = input.full_name.trim()
  if (!full_name) throw new Error('Full name is required.')

  const email =
    input.email !== undefined && input.email?.trim()
      ? normalizeAttendeeEmail(input.email)
      : null
  const phone =
    input.phone !== undefined ? input.phone?.trim() || null : null
  const rsvp_status =
    input.rsvp_status !== undefined
      ? input.rsvp_status === '' || input.rsvp_status == null
        ? null
        : input.rsvp_status
      : null
  const group_id =
    input.group_id !== undefined
      ? input.group_id?.trim() || null
      : null
  const party_role =
    input.party_role !== undefined ? input.party_role?.trim() || null : null

  const { data, error } = await supabase
    .from('attendees')
    .insert({
      full_name,
      email,
      phone,
      rsvp_status,
      group_id,
      is_placeholder: input.is_placeholder ?? false,
      party_role,
    })
    .select(SELECT)
    .single()

  if (error) {
    if (error.code === '23505')
      throw new Error('Another attendee already uses this email.')
    throw new Error(error.message || 'Failed to create guest.')
  }
  return normalizeAttendeeRow(data as AttendeeRow)
}

/** Set RSVP for every attendee in an invitation group (bulk). */
export async function updateRsvpForGroup(
  groupId: string,
  rsvp_status: string | null
): Promise<void> {
  const { error } = await supabase
    .from('attendees')
    .update({ rsvp_status })
    .eq('group_id', groupId)
    .eq('is_archived', false)

  if (error) throw new Error(error.message || 'Failed to update group RSVP.')
}

export async function archiveAttendee(id: string): Promise<void> {
  const { error } = await supabase
    .from('attendees')
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message || 'Failed to archive guest.')
}

function findMatch(
  r: ParsedAttendeeRow,
  byEmail: Map<string, AttendeeRow>,
  byName: Map<string, AttendeeRow>
): AttendeeRow | null {
  const csvEmail = r.email !== undefined && r.email ? r.email : null
  if (csvEmail) {
    const hit = byEmail.get(csvEmail)
    if (hit) return hit
  }
  const key = normalizeAttendeeName(r.full_name)
  return byName.get(key) ?? null
}

function rebuildMaps(rows: AttendeeRow[]) {
  const byEmail = new Map<string, AttendeeRow>()
  const byName = new Map<string, AttendeeRow>()
  for (const a of rows) {
    if (a.email?.trim()) {
      byEmail.set(normalizeAttendeeEmail(a.email), a)
    }
    const nk = normalizeAttendeeName(a.full_name)
    if (!byName.has(nk)) byName.set(nk, a)
  }
  return { byEmail, byName }
}

export type MergeResult = {
  inserted: number
  updated: number
  failed: number
}

/**
 * Upsert parsed CSV rows: merge by email (if in row) then by full_name.
 * Optional fields only overwrite when the CSV cell is non-empty (except RSVP: explicit empty clears to null).
 * Keeps attendees not listed in CSV. Mutates in-memory maps after each success.
 */
export async function mergeAttendeesFromCsvRows(
  parsed: ParsedAttendeeRow[],
  currentRows: AttendeeRow[],
  onProgress?: (done: number, total: number) => void
): Promise<{ result: MergeResult; nextRows: AttendeeRow[] }> {
  let inserted = 0
  let updated = 0
  let failed = 0
  const working = [...currentRows]
  let { byEmail, byName } = rebuildMaps(working)

  const total = parsed.length
  let done = 0

  for (const r of parsed) {
    try {
      const existing = findMatch(r, byEmail, byName)
      if (existing) {
        const patch: AttendeeUpdateInput = {
          full_name: r.full_name,
        }
        if (r.email !== undefined) patch.email = r.email
        if (r.phone !== undefined) patch.phone = r.phone
        if (r.rsvp_status !== undefined) patch.rsvp_status = r.rsvp_status

        await updateAttendee(existing.id, patch)
        const next: AttendeeRow = {
          ...existing,
          full_name: r.full_name,
          email: r.email !== undefined ? r.email : existing.email,
          phone: r.phone !== undefined ? r.phone : existing.phone,
          rsvp_status:
            r.rsvp_status !== undefined ? r.rsvp_status : existing.rsvp_status,
          updated_at: new Date().toISOString(),
        }
        const idx = working.findIndex((x) => x.id === existing.id)
        if (idx >= 0) working[idx] = next
        const rebuilt = rebuildMaps(working)
        byEmail = rebuilt.byEmail
        byName = rebuilt.byName
        updated++
      } else {
        const { data, error } = await supabase
          .from('attendees')
          .insert({
            full_name: r.full_name,
            email: r.email !== undefined ? r.email : null,
            phone: r.phone !== undefined ? r.phone : null,
            rsvp_status: r.rsvp_status !== undefined ? r.rsvp_status : null,
            group_id: null,
            is_placeholder: false,
            party_role: 'guest',
          })
          .select(SELECT)
          .single()

        if (error) throw new Error(error.message || 'Insert failed.')
        const row = data as AttendeeRow
        working.push(row)
        const rebuilt = rebuildMaps(working)
        byEmail = rebuilt.byEmail
        byName = rebuilt.byName
        inserted++
      }
    } catch {
      failed++
    }
    done++
    onProgress?.(done, total)
  }

  return {
    result: { inserted, updated, failed },
    nextRows: working,
  }
}

/**
 * Upload image to storage and return public URL (does not update DB).
 */
export async function uploadAttendeePhoto(params: {
  attendeeId: string
  blob: Blob
  contentType: string
}): Promise<string> {
  const ext =
    params.contentType === 'image/png'
      ? 'png'
      : params.contentType === 'image/webp'
        ? 'webp'
        : 'jpg'
  const path = `${params.attendeeId}/${uuidv4()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, params.blob, { contentType: params.contentType, upsert: false })

  if (uploadError) {
    throw new Error(uploadError.message || 'Photo upload failed.')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

/** Placeholder guest for a group (e.g. "Guest"); rename later in admin. */
export async function createPlaceholderAttendee(input: {
  groupId: string
  displayLabel?: string
}): Promise<AttendeeRow> {
  const full_name = input.displayLabel?.trim() || 'Guest'

  const { data, error } = await supabase
    .from('attendees')
    .insert({
      full_name,
      group_id: input.groupId,
      is_placeholder: true,
      party_role: 'placeholder',
    })
    .select(SELECT)
    .single()

  if (error) throw new Error(error.message || 'Failed to create placeholder.')
  return data as AttendeeRow
}
