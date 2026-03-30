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
  createAttendee,
  updateAttendee,
  type AttendeeRow,
} from '@/lib/admin-attendees'
import {
  createAttendeeGroup,
  updateAttendeeGroup,
} from '@/lib/admin-attendee-groups'
import { AdminBuilderShellHeader } from '@/app/admin/_components/AdminBuilderShellHeader'
import {
  AdminSelectDropdown,
  type AdminSelectOption,
} from '@/app/admin/_components/AdminSelectDropdown'

export type AttendeePartyBlock = {
  key: string
  kind: 'solo' | 'group'
  group?: { id: string; group_name: string }
  members: AttendeeRow[]
}

const MENU_ITEM =
  'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[14px] font-medium text-[#171717] hover:bg-zinc-50'

const DROPDOWN_BTN =
  'inline-flex h-9 min-w-[7rem] max-w-[11rem] shrink-0 items-center justify-between gap-2 rounded-full border border-[#ebebeb] bg-white px-2.5 pr-2 text-left text-[13px] font-medium text-[#171717] outline-none transition-colors hover:border-zinc-300'

type RsvpValue = '' | 'yes' | 'no' | 'pending'

const REL_PRIMARY = '' as const
type RelValue = '' | 'guest' | 'spouse' | 'kid'

export type EditorPartyRow = {
  key: string
  attendeeId?: string
  full_name: string
  rsvp_status: RsvpValue
  relationship: RelValue
}

function newRowKey() {
  return `r-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function firstName(fullName: string): string {
  const v = fullName.trim().split(/\s+/).filter(Boolean)[0]
  return v ?? ''
}

function attendeeToRelationship(m: AttendeeRow): RelValue {
  const pr = (m.party_role ?? '').trim().toLowerCase()
  if (pr === 'spouse') return 'spouse'
  if (pr === 'child') return 'kid'
  if (pr === 'guest' || pr === 'placeholder') return 'guest'
  return REL_PRIMARY
}

function roleFromRelationship(rel: RelValue, rowIndex: number): string | null {
  if (rowIndex === 0) {
    if (rel === 'spouse' || rel === 'kid') return 'lead'
    if (rel === 'guest') return 'guest'
    return 'lead'
  }
  if (rel === 'spouse') return 'spouse'
  if (rel === 'kid') return 'child'
  return 'guest'
}

function normRsvp(v: RsvpValue): string | null {
  if (v === '' || v === 'pending') return v === 'pending' ? 'pending' : null
  return v
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
    value: '',
    label: (
      <span className="flex items-center gap-2 text-zinc-500">
        <span className="h-4 w-4 shrink-0 rounded-full border border-zinc-300" aria-hidden />
        Not set
      </span>
    ),
  },
]

function rsvpTriggerLabel(value: RsvpValue) {
  const opt = RSVP_OPTIONS.find((o) => o.value === value)
  return opt?.label ?? RSVP_OPTIONS[3]!.label
}

const REL_LABELS: Record<RelValue, React.ReactNode> = {
  '': <span className="text-zinc-600">Primary</span>,
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
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const resetForOpen = useCallback(() => {
    if (mode === 'create') {
      setRows([
        {
          key: newRowKey(),
          full_name: '',
          rsvp_status: '',
          relationship: REL_PRIMARY,
        },
      ])
      return
    }
    if (!party?.members.length) {
      setRows([
        {
          key: newRowKey(),
          full_name: '',
          rsvp_status: '',
          relationship: REL_PRIMARY,
        },
      ])
      return
    }
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
    setRows(
      sorted.map((m, i) => ({
        key: m.id,
        attendeeId: m.id,
        full_name: m.full_name,
        rsvp_status: ((): RsvpValue => {
          const s = (m.rsvp_status ?? '').trim().toLowerCase()
          if (s === 'yes') return 'yes'
          if (s === 'no') return 'no'
          if (s === 'pending') return 'pending'
          return ''
        })(),
        relationship: i === 0 ? REL_PRIMARY : attendeeToRelationship(m),
      }))
    )
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

  const title = mode === 'create' ? 'New attendee' : 'Edit attendee'

  const addRow = useCallback(() => {
    const k = newRowKey()
    setRows((prev) => [
      ...prev,
      {
        key: k,
        full_name: '',
        rsvp_status: prev[0]?.rsvp_status ?? '',
        relationship: 'guest',
      },
    ])
    queueMicrotask(() => nameRefs.current[k]?.focus())
  }, [])

  const relationshipOptionsForRow = useCallback((rowIndex: number): AdminSelectOption<RelValue>[] => {
    if (rowIndex === 0) {
      return [
        { value: REL_PRIMARY, label: REL_LABELS[''] },
        { value: 'guest', label: REL_LABELS.guest },
        { value: 'spouse', label: REL_LABELS.spouse },
        { value: 'kid', label: REL_LABELS.kid },
      ]
    }
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
          await createAttendee({
            full_name: r.full_name.trim(),
            rsvp_status: normRsvp(r.rsvp_status),
            party_role: roleFromRelationship(r.relationship, 0),
            group_id: null,
            is_placeholder: false,
          })
        } else {
          const group_name = deriveGroupName(valid)
          const g = await createAttendeeGroup({ group_name, notes: null })
          for (let i = 0; i < valid.length; i += 1) {
            const r = valid[i]!
            await createAttendee({
              full_name: r.full_name.trim(),
              rsvp_status: normRsvp(r.rsvp_status),
              group_id: g.id,
              party_role: roleFromRelationship(r.relationship, i),
              is_placeholder: false,
            })
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
            })
          } else {
            const group_name = deriveGroupName(valid)
            const g = await createAttendeeGroup({ group_name, notes: null })
            await updateAttendee(m.id, {
              group_id: g.id,
              full_name: valid[0]!.full_name.trim(),
              rsvp_status: normRsvp(valid[0]!.rsvp_status),
              party_role: 'lead',
            })
            for (let i = 1; i < valid.length; i += 1) {
              const r = valid[i]!
              await createAttendee({
                full_name: r.full_name.trim(),
                rsvp_status: normRsvp(r.rsvp_status),
                group_id: g.id,
                party_role: roleFromRelationship(r.relationship, i),
                is_placeholder: false,
              })
            }
          }
        } else {
          const gid = party.group!.id
          const nextName = deriveGroupName(valid)
          await updateAttendeeGroup(gid, { group_name: nextName })
          const seen = new Set<string>()
          for (let i = 0; i < valid.length; i += 1) {
            const r = valid[i]!
            if (r.attendeeId) {
              seen.add(r.attendeeId)
              await updateAttendee(r.attendeeId, {
                full_name: r.full_name.trim(),
                rsvp_status: normRsvp(r.rsvp_status),
                party_role: roleFromRelationship(r.relationship, i),
              })
            } else {
              await createAttendee({
                full_name: r.full_name.trim(),
                rsvp_status: normRsvp(r.rsvp_status),
                group_id: gid,
                party_role: roleFromRelationship(r.relationship, i),
                is_placeholder: false,
              })
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

  const onRelTriggerKeyDown = useCallback(
    (rowIndex: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
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
      <div
        className="relative z-10 flex max-h-[min(90vh,880px)] w-full max-w-[640px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <AdminBuilderShellHeader title={title} onClose={onClose} center={null} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-center text-[13px] font-medium text-zinc-500">
            {mode === 'create'
              ? 'Add one guest or build a party. Press Tab on the last relationship field to add another row.'
              : 'Update names, RSVP, or party members.'}
          </p>
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div
                key={row.key}
                className={`flex flex-col gap-2 rounded-2xl border border-[#ebebeb] bg-[#fafafa] p-3 sm:flex-row sm:items-center sm:gap-3 ${i > 0 ? 'ml-2 border-l-4 border-l-zinc-200 pl-3' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="rounded-2xl bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] p-[1px] shadow-[0_0_0_1px_rgba(91,56,242,0.08),0_0_28px_rgba(28,160,216,0.18)]">
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
                      placeholder="Full name"
                      autoFocus={i === 0 && mode === 'create'}
                      className="h-11 w-full rounded-2xl border-0 bg-white px-3 !text-[15px] font-medium text-zinc-900 outline-none placeholder:text-zinc-400"
                    />
                  </div>
                </div>
                <AdminSelectDropdown<RsvpValue>
                  value={row.rsvp_status}
                  onChange={(v) =>
                    setRows((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, rsvp_status: v } : r))
                    )
                  }
                  options={RSVP_OPTIONS}
                  className="w-auto shrink-0"
                  buttonClassName={DROPDOWN_BTN}
                  menuItemClassName={MENU_ITEM}
                  renderValue={() => (
                    <span className="flex min-w-0 items-center gap-2">{rsvpTriggerLabel(row.rsvp_status)}</span>
                  )}
                />
                <AdminSelectDropdown<RelValue>
                  value={i > 0 && row.relationship === REL_PRIMARY ? 'guest' : row.relationship}
                  onChange={(v) =>
                    setRows((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, relationship: v } : r))
                    )
                  }
                  options={relationshipOptionsForRow(i)}
                  className="w-auto shrink-0"
                  buttonClassName={DROPDOWN_BTN}
                  menuItemClassName={MENU_ITEM}
                  onTriggerKeyDown={onRelTriggerKeyDown(i)}
                  renderValue={() => (
                    <span className="truncate">
                      {i > 0
                        ? REL_LABELS[row.relationship === REL_PRIMARY ? 'guest' : row.relationship]
                        : REL_LABELS[row.relationship]}
                    </span>
                  )}
                />
              </div>
            ))}
          </div>
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={addRow}
              className="mt-3 text-[13px] font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
            >
              + Add party member
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-full border border-zinc-200 bg-white px-4 text-[14px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-full bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)] px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
