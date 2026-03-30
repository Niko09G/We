'use client'

import type { AttendeeRow } from '@/lib/admin-attendees'
import {
  computePartyExtraGuestsCount,
  computePartyKidsCount,
  type SeatingParty,
} from '@/lib/seating-planner'

export function seatRangeLabel(p: SeatingParty): string {
  if (p.minSeat == null || p.maxSeat == null) return '—'
  if (p.minSeat === p.maxSeat) return String(p.minSeat)
  return `${p.minSeat}–${p.maxSeat}`
}

/** Adults first (lead / spouse) for avatar strip, then others. */
export function avatarMembersForPartyStrip(members: AttendeeRow[], max = 2): AttendeeRow[] {
  const rank = (m: AttendeeRow) => {
    if (m.is_placeholder) return 5
    if (m.party_role === 'lead_adult' || m.party_role === 'lead') return 0
    if (m.party_role === 'spouse') return 1
    if (m.party_role === 'child') return 3
    return 2
  }
  const sorted = [...members].sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
  return sorted.slice(0, max)
}

export function PartyMetaLine({ party }: { party: SeatingParty }) {
  const kids = computePartyKidsCount(party.members)
  const extras = computePartyExtraGuestsCount(party.members)
  return (
    <span className="tabular-nums text-[11px] text-zinc-500">
      {party.members.length} seat{party.members.length === 1 ? '' : 's'}
      {kids > 0 ? ` · ${kids} kid${kids === 1 ? '' : 's'}` : ''}
      {extras > 0 ? ` · ${extras} extra` : ''}
    </span>
  )
}

export function PartyAvatarCluster({
  members,
  size = 'md',
}: {
  members: AttendeeRow[]
  size?: 'sm' | 'md'
}) {
  const shown = avatarMembersForPartyStrip(members, 2)
  const rest = Math.max(0, members.length - 2)
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-[11px]'
  return (
    <div className="flex shrink-0 items-center">
      <div className="flex -space-x-1.5">
        {shown.map((m) => (
          <div
            key={m.id}
            className={`${dim} shrink-0 overflow-hidden rounded-full border border-[#ebebeb] bg-zinc-100`}
            title={m.full_name}
          >
            {m.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-semibold text-zinc-500">
                {(m.full_name.trim().split(/\s+/)[0]?.[0] ?? '?').toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
      {rest > 0 ? (
        <span className="ml-1 text-[11px] font-semibold tabular-nums text-zinc-500">+{rest}</span>
      ) : null}
    </div>
  )
}

export function SeatVisualizationStrip({
  capacity,
  attendeesAtTable,
}: {
  capacity: number
  attendeesAtTable: AttendeeRow[]
}) {
  const occupied = new Set<number>()
  for (const r of attendeesAtTable) {
    const n = r.seat_number
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= capacity) {
      occupied.add(Math.trunc(n))
    }
  }

  const numClass = capacity > 24 ? 'text-[7px]' : capacity > 14 ? 'text-[8px]' : 'text-[9px]'
  return (
    <div className="w-full rounded-lg border border-[#ebebeb] bg-[#f4f4f5] p-1">
      <div className="flex w-full gap-px">
        {Array.from({ length: capacity }, (_, i) => {
          const n = i + 1
          const filled = occupied.has(n)
          return (
            <div
              key={n}
              className={`flex min-h-[26px] min-w-0 flex-1 flex-col items-center justify-center rounded-[3px] ${
                filled ? 'bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]/35' : 'bg-white'
              }`}
              title={`Seat ${n}${filled ? ' · occupied' : ' · empty'}`}
            >
              <span
                className={`tabular-nums font-semibold leading-none text-zinc-500 ${numClass}`}
              >
                {n}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
