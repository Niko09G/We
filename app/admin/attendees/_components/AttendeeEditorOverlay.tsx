'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  archiveAttendee,
  createAttendee,
  updateAttendee,
  uploadAttendeePhoto,
  removeAttendeePhotoByPublicUrl,
  type AttendeeRow,
} from '@/lib/admin-attendees'
import {
  createAttendeeGroup,
  updateAttendeeGroup,
} from '@/lib/admin-attendee-groups'
import { compressAvatarImage } from '@/lib/image-compress'
import { AdminBuilderShellHeader } from '@/app/admin/_components/AdminBuilderShellHeader'
import {
  AdminSelectDropdown,
  type AdminSelectOption,
} from '@/app/admin/_components/AdminSelectDropdown'
import { AdminDropdown } from '@/app/admin/_components/AdminDropdown'
import {
  DIETARY_RESTRICTION_OPTIONS,
  dietaryBadgeClass,
  normalizeDietaryRestrictions,
  type DietaryRestriction,
} from '@/lib/guest-logistics'

export type AttendeePartyBlock = {
  key: string
  kind: 'solo' | 'group'
  group?: { id: string; group_name: string }
  members: AttendeeRow[]
}

const BUILDER_SHELL =
  'admin-font relative z-10 flex h-[90vh] max-h-[900px] min-h-0 w-full max-w-[1180px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm'

const MENU_ITEM =
  'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[14px] font-medium text-[#171717] hover:bg-zinc-50'

const MENU_WIDE = 'w-max min-w-[13.5rem] max-w-[min(calc(100vw-48px),280px)]'

const DROPDOWN_BTN =
  'inline-flex h-9 min-w-[7rem] max-w-[11rem] shrink-0 cursor-pointer items-center justify-between gap-2 rounded-full border border-[#ebebeb] bg-white px-2.5 pr-2 text-left text-[13px] font-medium text-[#171717] outline-none transition-colors hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-[#5b38f2]/35 focus-visible:ring-offset-2'

/** Gradient ring when inner control is focused (focus-within / has :focus-visible) */
const FOCUS_RING =
  'rounded-full border border-[#ebebeb] bg-[#ebebeb] p-[1px] transition-[box-shadow,background] duration-150 focus-within:border-transparent focus-within:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] focus-within:shadow-[0_0_0_1px_rgba(91,56,242,0.08),0_0_28px_rgba(28,160,216,0.18)]'

type RsvpValue = 'yes' | 'no' | 'pending'

const REL_PRIMARY = '' as const
type RelValue = '' | 'guest' | 'spouse' | 'kid'

export type EditorPartyRow = {
  key: string
  attendeeId?: string
  full_name: string
  rsvp_status: RsvpValue
  relationship: RelValue
  photo_url: string | null
  /** Local preview (blob URL); revoke when replaced */
  photoObjectUrl: string | null
  photoFile: File | null
  dietary_restrictions: DietaryRestriction[]
  needs_baby_chair: boolean
  needs_kids_menu: boolean
  no_meal: boolean
}

function newRowKey() {
  return `r-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function firstName(fullName: string): string {
  const v = fullName.trim().split(/\s+/).filter(Boolean)[0]
  return v ?? ''
}

function revokeIfBlob(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function attendeeToRelationship(m: AttendeeRow): RelValue {
  const pr = (m.party_role ?? '').trim().toLowerCase()
  if (pr === 'spouse') return 'spouse'
  if (pr === 'child') return 'kid'
  if (pr === 'guest' || pr === 'placeholder') return 'guest'
  return REL_PRIMARY
}

function rsvpFromServer(m: AttendeeRow): RsvpValue {
  const s = (m.rsvp_status ?? '').trim().toLowerCase()
  if (s === 'yes') return 'yes'
  if (s === 'no') return 'no'
  if (s === 'pending') return 'pending'
  return 'pending'
}

function roleFromRelationship(rel: RelValue, rowIndex: number): string | null {
  if (rowIndex === 0) {
    if (rel === 'guest') return 'guest'
    return 'lead'
  }
  if (rel === 'spouse') return 'spouse'
  if (rel === 'kid') return 'child'
  return 'guest'
}

function normRsvp(v: RsvpValue): string | null {
  if (v === 'pending') return 'pending'
  if (v === 'yes') return 'yes'
  if (v === 'no') return 'no'
  return 'pending'
}

function logisticsPatchFromRow(r: EditorPartyRow) {
  return {
    dietary_restrictions: normalizeDietaryRestrictions(r.dietary_restrictions),
    needs_baby_chair: r.needs_baby_chair,
    needs_kids_menu: r.needs_kids_menu,
    no_meal: r.no_meal,
  }
}

function LogisticsToggle({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={`${DROPDOWN_BTN} border-0 shadow-none ${
        active
          ? 'border-[#5b38f2]/35 bg-[#5b38f2]/10 text-[#3f2bb8]'
          : 'text-zinc-600'
      }`}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}

function DietaryRestrictionsPicker({
  value,
  onChange,
}: {
  value: DietaryRestriction[]
  onChange: (next: DietaryRestriction[]) => void
}) {
  const toggle = (option: DietaryRestriction) => {
    onChange(
      value.includes(option)
        ? value.filter((v) => v !== option)
        : [...value, option]
    )
  }

  return (
    <AdminDropdown
      closeOnMenuItemClick={false}
      className="min-w-0"
      buttonClassName={`${DROPDOWN_BTN} w-full max-w-[11rem] border-0 shadow-none`}
      menuClassName="min-w-[9rem]"
      trigger={
        <>
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
            {value.length === 0 ? (
              <span className="truncate text-zinc-400">Dietary</span>
            ) : (
              <span className="truncate">{value.join(', ')}</span>
            )}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-3.5 w-3.5 shrink-0 text-zinc-400"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      }
    >
      {DIETARY_RESTRICTION_OPTIONS.map((option) => {
        const selected = value.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-[#171717] hover:bg-zinc-50"
          >
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${dietaryBadgeClass(option)}`}
            >
              {option}
            </span>
            {selected ? (
              <span className="text-[#5b38f2]" aria-hidden>
                ✓
              </span>
            ) : (
              <span className="h-4 w-4" aria-hidden />
            )}
          </button>
        )
      })}
    </AdminDropdown>
  )
}

const RsvpIconYes = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
  </svg>
)
const RsvpIconNo = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-red-500" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.2}>
    <path strokeLinecap="round" d="M18 6 6 18M6 6l12 12" />
  </svg>
)
const RsvpIconPending = () => (
  <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
    <span className="h-2 w-2 rounded-full bg-amber-400" />
  </span>
)

const RSVP_OPTIONS: { value: RsvpValue; label: React.ReactNode }[] = [
  {
    value: 'pending',
    label: (
      <span className="flex items-center gap-2">
        <RsvpIconPending />
        Pending
      </span>
    ),
  },
  {
    value: 'yes',
    label: (
      <span className="flex items-center gap-2">
        <RsvpIconYes />
        Yes
      </span>
    ),
  },
  {
    value: 'no',
    label: (
      <span className="flex items-center gap-2">
        <RsvpIconNo />
        No
      </span>
    ),
  },
]

function rsvpTriggerLabel(value: RsvpValue) {
  const opt = RSVP_OPTIONS.find((o) => o.value === value)
  return opt?.label ?? RSVP_OPTIONS[0]!.label
}

const REL_LABELS: Record<Exclude<RelValue, ''>, React.ReactNode> = {
  guest: 'Guest',
  spouse: 'Spouse',
  kid: 'Kid',
}

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  party: AttendeePartyBlock | null
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
  onSuccess: (message: string) => void
}

function emptyRow(): EditorPartyRow {
  return {
    key: newRowKey(),
    full_name: '',
    rsvp_status: 'pending',
    relationship: REL_PRIMARY,
    photo_url: null,
    photoObjectUrl: null,
    photoFile: null,
    dietary_restrictions: [],
    needs_baby_chair: false,
    needs_kids_menu: false,
    no_meal: false,
  }
}

async function syncPhotoForAttendee(
  attendeeId: string,
  displayName: string,
  file: File | null,
  previousPublicUrl: string | null
) {
  if (!file) return
  const { blob, contentType } = await compressAvatarImage(file)
  const url = await uploadAttendeePhoto({
    attendeeFirstName: firstName(displayName) || 'attendee',
    blob,
    contentType,
  })
  await updateAttendee(attendeeId, { photo_url: url })
  await removeAttendeePhotoByPublicUrl(previousPublicUrl)
}

export function AttendeeEditorOverlay({
  open,
  mode,
  party,
  onClose,
  onSaved,
  onError,
  onSuccess,
}: Props) {
  const [rows, setRows] = useState<EditorPartyRow[]>([])
  const [busy, setBusy] = useState(false)
  const [enterAnimKey, setEnterAnimKey] = useState<string | null>(null)
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const resetForOpen = useCallback(() => {
    setRows((prev) => {
      for (const r of prev) revokeIfBlob(r.photoObjectUrl)
      if (mode === 'create') return [emptyRow()]
      if (!party?.members.length) return [emptyRow()]
      const sorted = [...party.members].sort((a, b) => {
        const rank = (m: AttendeeRow) => {
          const pr = (m.party_role ?? '').toLowerCase()
          if (pr === 'lead_adult' || pr === 'lead') return 0
          if (pr === 'spouse') return 1
          if (pr === 'child') return 2
          return 3
        }
        const d = rank(a) - rank(b)
        if (d !== 0) return d
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
      return sorted.map((m, i) => ({
        key: m.id,
        attendeeId: m.id,
        full_name: m.full_name,
        rsvp_status: rsvpFromServer(m),
        relationship: i === 0 ? REL_PRIMARY : attendeeToRelationship(m),
        photo_url: m.photo_url ?? null,
        photoObjectUrl: null,
        photoFile: null,
        dietary_restrictions: normalizeDietaryRestrictions(m.dietary_restrictions),
        needs_baby_chair: Boolean(m.needs_baby_chair),
        needs_kids_menu: Boolean(m.needs_kids_menu),
        no_meal: Boolean(m.no_meal),
      }))
    })
  }, [mode, party])

  useEffect(() => {
    if (open) resetForOpen()
  }, [open, resetForOpen])

  useEffect(() => {
    if (!open) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const rowsSnapshotRef = useRef(rows)
  rowsSnapshotRef.current = rows
  useEffect(() => {
    if (open) return
    for (const r of rowsSnapshotRef.current) revokeIfBlob(r.photoObjectUrl)
  }, [open])

  const title = mode === 'create' ? 'Add Guest / Party' : 'Edit Guest / Party'

  const addRow = useCallback(() => {
    const k = newRowKey()
    setEnterAnimKey(k)
    window.setTimeout(() => {
      setEnterAnimKey((cur) => (cur === k ? null : cur))
    }, 220)
    setRows((prev) => [
      ...prev,
      {
        key: k,
        full_name: '',
        rsvp_status: prev[0]?.rsvp_status ?? 'pending',
        relationship: 'guest',
        photo_url: null,
        photoObjectUrl: null,
        photoFile: null,
        dietary_restrictions: [],
        needs_baby_chair: false,
        needs_kids_menu: false,
        no_meal: false,
      },
    ])
    queueMicrotask(() => nameRefs.current[k]?.focus())
  }, [])

  const removePartyMemberRow = useCallback(
    async (row: EditorPartyRow, index: number) => {
      if (index === 0) return
      if (row.attendeeId) {
        if (!window.confirm('Remove this guest from the party?')) return
        try {
          await archiveAttendee(row.attendeeId)
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Failed to remove guest.')
          return
        }
      }
      revokeIfBlob(row.photoObjectUrl)
      setRows((prev) => prev.filter((r) => r.key !== row.key))
    },
    [onError]
  )

  const relationshipOptionsForRow = useCallback((rowIndex: number): AdminSelectOption<RelValue>[] => {
    if (rowIndex === 0) return []
    return [
      { value: 'guest', label: REL_LABELS.guest },
      { value: 'spouse', label: REL_LABELS.spouse },
      { value: 'kid', label: REL_LABELS.kid },
    ]
  }, [])

  const deriveGroupName = useCallback((memberRows: EditorPartyRow[]) => {
    const names = memberRows.map((r) => r.full_name.trim()).filter(Boolean)
    if (names.length === 0) return 'Party'
    if (names.length >= 2 && memberRows[1]?.relationship === 'spouse') {
      return `${firstName(names[0]!)} & ${firstName(names[1]!)}`
    }
    return firstName(names[0]!)
  }, [])

  const onPickPhoto = useCallback((rowKey: string, file: File | null) => {
    if (!file) return
    const ok = ['image/jpeg', 'image/png', 'image/webp']
    if (!ok.includes(file.type)) {
      onError('Use JPG, PNG, or WebP.')
      return
    }
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== rowKey) return r
        revokeIfBlob(r.photoObjectUrl)
        return {
          ...r,
          photoFile: file,
          photoObjectUrl: URL.createObjectURL(file),
          photo_url: null,
        }
      })
    )
  }, [onError])

  const save = useCallback(async () => {
    const valid = rows.filter((r) => r.full_name.trim())
    if (valid.length === 0) {
      onError('Enter at least one full name.')
      return
    }
    for (let i = 1; i < rows.length; i += 1) {
      if (!rows[i]!.full_name.trim()) continue
      if (rows[i]!.relationship === REL_PRIMARY) {
        onError('Each additional guest needs a relationship (Guest, Spouse, or Kid).')
        return
      }
    }

    setBusy(true)
    try {
      if (mode === 'create') {
        if (valid.length === 1) {
          const r = valid[0]!
          const created = await createAttendee({
            full_name: r.full_name.trim(),
            rsvp_status: normRsvp(r.rsvp_status),
            party_role: roleFromRelationship(r.relationship, 0),
            group_id: null,
            is_placeholder: false,
            ...logisticsPatchFromRow(r),
          })
          await syncPhotoForAttendee(created.id, r.full_name, r.photoFile, null)
        } else {
          const group_name = deriveGroupName(valid)
          const g = await createAttendeeGroup({ group_name, notes: null })
          for (let i = 0; i < valid.length; i += 1) {
            const r = valid[i]!
            const created = await createAttendee({
              full_name: r.full_name.trim(),
              rsvp_status: normRsvp(r.rsvp_status),
              group_id: g.id,
              party_role: roleFromRelationship(r.relationship, i),
              is_placeholder: false,
              ...logisticsPatchFromRow(r),
            })
            const prevUrl = r.photo_url
            await syncPhotoForAttendee(created.id, r.full_name, r.photoFile, prevUrl)
          }
        }
        onSuccess('Attendee saved.')
      } else if (party) {
        if (party.kind === 'solo') {
          const m = party.members[0]!
          if (valid.length === 1) {
            const r = valid[0]!
            await updateAttendee(m.id, {
              full_name: r.full_name.trim(),
              rsvp_status: normRsvp(r.rsvp_status),
              party_role: roleFromRelationship(r.relationship, 0),
              ...logisticsPatchFromRow(r),
            })
            await syncPhotoForAttendee(m.id, r.full_name, r.photoFile, m.photo_url ?? null)
          } else {
            const group_name = deriveGroupName(valid)
            const g = await createAttendeeGroup({ group_name, notes: null })
            await updateAttendee(m.id, {
              group_id: g.id,
              full_name: valid[0]!.full_name.trim(),
              rsvp_status: normRsvp(valid[0]!.rsvp_status),
              party_role: 'lead',
              ...logisticsPatchFromRow(valid[0]!),
            })
            await syncPhotoForAttendee(
              m.id,
              valid[0]!.full_name,
              valid[0]!.photoFile,
              valid[0]!.photoObjectUrl ? m.photo_url ?? null : m.photo_url ?? null
            )
            for (let i = 1; i < valid.length; i += 1) {
              const r = valid[i]!
              if (r.attendeeId) {
                await updateAttendee(r.attendeeId, {
                  full_name: r.full_name.trim(),
                  rsvp_status: normRsvp(r.rsvp_status),
                  party_role: roleFromRelationship(r.relationship, i),
                  ...logisticsPatchFromRow(r),
                })
                await syncPhotoForAttendee(r.attendeeId, r.full_name, r.photoFile, r.photo_url)
              } else {
                const created = await createAttendee({
                  full_name: r.full_name.trim(),
                  rsvp_status: normRsvp(r.rsvp_status),
                  group_id: g.id,
                  party_role: roleFromRelationship(r.relationship, i),
                  is_placeholder: false,
                  ...logisticsPatchFromRow(r),
                })
                await syncPhotoForAttendee(created.id, r.full_name, r.photoFile, null)
              }
            }
          }
        } else {
          const gid = party.group!.id
          const nextName = deriveGroupName(valid)
          await updateAttendeeGroup(gid, { group_name: nextName })
          for (let i = 0; i < valid.length; i += 1) {
            const r = valid[i]!
            if (r.attendeeId) {
              await updateAttendee(r.attendeeId, {
                full_name: r.full_name.trim(),
                rsvp_status: normRsvp(r.rsvp_status),
                party_role: roleFromRelationship(r.relationship, i),
                ...logisticsPatchFromRow(r),
              })
              const prevPhoto = party.members.find((x) => x.id === r.attendeeId)?.photo_url ?? null
              await syncPhotoForAttendee(r.attendeeId, r.full_name, r.photoFile, prevPhoto)
            } else {
              const created = await createAttendee({
                full_name: r.full_name.trim(),
                rsvp_status: normRsvp(r.rsvp_status),
                group_id: gid,
                party_role: roleFromRelationship(r.relationship, i),
                is_placeholder: false,
                ...logisticsPatchFromRow(r),
              })
              await syncPhotoForAttendee(created.id, r.full_name, r.photoFile, null)
            }
          }
        }
        onSuccess('Attendee updated.')
      }
      await onSaved()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }, [rows, mode, party, deriveGroupName, onClose, onError, onSuccess, onSaved])

  const onNameKeyDown = useCallback(
    (rowIndex: number) => (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Tab' || e.shiftKey) return
      if (rowIndex !== rows.length - 1) return
      e.preventDefault()
      addRow()
    },
    [rows.length, addRow]
  )

  if (!open) return null

  return createPortal(
    <div
      className="admin-font fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return
        onClose()
      }}
    >
      <div className={BUILDER_SHELL} onMouseDown={(e) => e.stopPropagation()}>
        <AdminBuilderShellHeader title={title} onClose={onClose} center={null} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-0 divide-y divide-[#ebebeb] transition-[gap] duration-200 ease-out">
            {rows.map((row, i) => {
              const rel =
                i > 0 && row.relationship === REL_PRIMARY ? 'guest' : row.relationship
              const displayPhoto = row.photoObjectUrl ?? row.photo_url
              return (
                <div
                  key={row.key}
                  data-attendee-row
                  className={`motion-safe:transition-[padding,opacity] motion-safe:duration-200 motion-safe:ease-out flex flex-col gap-2 py-4 ${i > 0 ? 'sm:pl-3' : ''} ${
                    enterAnimKey === row.key
                      ? 'motion-safe:animate-[attendeePartyRowEnter_0.18s_ease-out_both]'
                      : ''
                  }`}
                >
                  <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-2">
                  <input
                    ref={(el) => {
                      fileInputs.current[row.key] = el
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null
                      e.target.value = ''
                      onPickPhoto(row.key, file)
                    }}
                  />
                  <div className={`relative shrink-0 ${FOCUS_RING}`}>
                    <button
                      type="button"
                      title="Add photo"
                      onClick={() => fileInputs.current[row.key]?.click()}
                      className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-zinc-100 outline-none"
                    >
                      {displayPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={displayPhoto} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-zinc-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          aria-hidden
                        >
                          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <div className={`min-w-0 shrink-0 sm:max-w-[11rem] sm:flex-[0_1_11rem] ${FOCUS_RING}`}>
                    <input
                      ref={(el) => {
                        nameRefs.current[row.key] = el
                      }}
                      value={row.full_name}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, full_name: e.target.value } : r
                          )
                        )
                      }
                      onKeyDown={onNameKeyDown(i)}
                      placeholder="Full name"
                      autoFocus={i === 0 && mode === 'create'}
                      className="h-9 w-full rounded-full border-0 bg-white px-3 !text-[15px] font-medium text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:outline-none"
                    />
                  </div>

                  <div className={`min-w-0 shrink-0 sm:max-w-[11rem] sm:flex-[0_1_11rem] ${FOCUS_RING}`}>
                    <DietaryRestrictionsPicker
                      value={row.dietary_restrictions}
                      onChange={(next) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, dietary_restrictions: next } : r
                          )
                        )
                      }
                    />
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <div className={FOCUS_RING}>
                      <LogisticsToggle
                        active={row.needs_baby_chair}
                        label="Baby Chair 🪑"
                        onClick={() =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, needs_baby_chair: !r.needs_baby_chair }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                    <div className={FOCUS_RING}>
                      <LogisticsToggle
                        active={row.needs_kids_menu}
                        label="Kids Menu 🧒"
                        onClick={() =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, needs_kids_menu: !r.needs_kids_menu }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                    <div className={FOCUS_RING}>
                      <LogisticsToggle
                        active={row.no_meal}
                        label="No Meal 🚫"
                        onClick={() =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, no_meal: !r.no_meal } : r
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className={`shrink-0 ${FOCUS_RING}`}>
                    <AdminSelectDropdown<RsvpValue>
                      value={row.rsvp_status}
                      onChange={(v) =>
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, rsvp_status: v } : r))
                        )
                      }
                      options={RSVP_OPTIONS}
                      className="w-auto"
                      menuClassName={MENU_WIDE}
                      buttonClassName={`${DROPDOWN_BTN} border-0 shadow-none`}
                      menuItemClassName={MENU_ITEM}
                      renderValue={() => (
                        <span className="flex min-w-0 items-center gap-2">{rsvpTriggerLabel(row.rsvp_status)}</span>
                      )}
                    />
                  </div>

                  {i > 0 ? (
                    <div className={`flex shrink-0 ${FOCUS_RING}`}>
                      <AdminSelectDropdown<RelValue>
                        value={rel}
                        onChange={(v) =>
                          setRows((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, relationship: v } : r))
                          )
                        }
                        options={relationshipOptionsForRow(i)}
                        className="w-auto"
                        menuClassName={MENU_WIDE}
                        buttonClassName={`${DROPDOWN_BTN} border-0 shadow-none`}
                        menuItemClassName={MENU_ITEM}
                        renderValue={() => (
                          <span className="truncate">
                            {REL_LABELS[rel as Exclude<RelValue, ''>] ?? 'Guest'}
                          </span>
                        )}
                      />
                    </div>
                  ) : (
                    <div className="hidden w-[7rem] shrink-0 sm:block" aria-hidden />
                  )}

                  {i > 0 ? (
                    <button
                      type="button"
                      title="Remove from party"
                      onClick={() => void removePartyMemberRow(row, i)}
                      className="shrink-0 rounded-full px-2 py-1.5 text-[12px] font-medium text-zinc-500 underline decoration-zinc-300 decoration-1 underline-offset-2 hover:text-zinc-800"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="w-14 shrink-0 sm:w-[4.5rem]" aria-hidden />
                  )}
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="group/add-row mt-3 flex min-h-[50px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-dashed border-[#dcdcdc] bg-[#f9fafb] px-3 py-1.5 text-[13px] font-semibold text-zinc-600 transition-[background,border-color,color] duration-200 ease-out hover:border-transparent hover:bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] hover:text-white"
          >
            <kbd className="inline-flex h-6 min-w-[1.75rem] shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 px-1.5 font-mono text-[11px] font-medium text-zinc-600 transition-[border-color,background,color] group-hover/add-row:border-white/40 group-hover/add-row:bg-white/15 group-hover/add-row:text-white">
              Tab
            </kbd>
            <span
              className="text-[22px] font-light leading-none text-[#5b38f2] transition-colors duration-200 group-hover/add-row:text-white"
              aria-hidden
            >
              +
            </span>
            <span className="transition-colors group-hover/add-row:text-white">
              Add more to this party
            </span>
          </button>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 cursor-pointer items-center rounded-full border border-zinc-200 bg-white px-4 text-[14px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex h-10 cursor-pointer items-center rounded-full bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
