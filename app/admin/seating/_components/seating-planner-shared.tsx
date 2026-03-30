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

function displayFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? ''
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

/**
 * Two-sided seat map aligned with guest `SeatingMapPanel` seat pairing:
 * odd seat numbers on top, even on bottom, paired by column (1–2, 3–4, …).
 */
export function AdminTableTwinSeatMap({
  capacity,
  attendeesAtTable,
}: {
  capacity: number
  attendeesAtTable: AttendeeRow[]
}) {
  const bySeat = new Map<number, AttendeeRow>()
  for (const r of attendeesAtTable) {
    const n = r.seat_number
    if (typeof n === 'number' && Number.isFinite(n)) {
      const sn = Math.trunc(n)
      if (sn >= 1 && sn <= capacity) bySeat.set(sn, r)
    }
  }

  const perSide = Math.max(1, Math.ceil(capacity / 2))
  const labelClass =
    capacity > 22 ? 'text-[7px]' : capacity > 14 ? 'text-[8px]' : 'text-[9px]'

  return (
    <div className="rounded-xl border border-[#ebebeb] bg-[#fafafa] p-2">
      <div className="relative rounded-lg border border-zinc-200/90 bg-white px-1.5 pb-2 pt-7">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-1 w-[85%] max-w-[calc(100%-8px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ebebeb]"
          aria-hidden
        />
        <p className="absolute left-2 top-1.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
          Head
        </p>
        <div
          className="relative z-[1] grid gap-x-1 gap-y-1.5"
          style={{
            gridTemplateColumns: `repeat(${perSide}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: perSide }, (_, col) => {
            const topSeat = col * 2 + 1
            const bottomSeat = col * 2 + 2
            const topGuest = bySeat.get(topSeat)
            const bottomGuest =
              bottomSeat <= capacity ? bySeat.get(bottomSeat) : undefined

            return (
              <div key={col} className="flex min-w-0 flex-col gap-1">
                <SeatCell seatNum={topSeat} guest={topGuest} labelClass={labelClass} />
                {bottomSeat <= capacity ? (
                  <SeatCell seatNum={bottomSeat} guest={bottomGuest} labelClass={labelClass} />
                ) : (
                  <div className="min-h-[2.25rem]" aria-hidden />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SeatCell({
  seatNum,
  guest,
  labelClass,
}: {
  seatNum: number
  guest: AttendeeRow | undefined
  labelClass: string
}) {
  const filled = Boolean(guest)
  return (
    <div
      title={
        guest
          ? `Seat ${seatNum} · ${guest.full_name}`
          : `Seat ${seatNum} · empty`
      }
      className={`flex min-h-[2.35rem] min-w-0 flex-col justify-center rounded-md border px-0.5 py-0.5 ${
        filled
          ? 'border-[#5b38f2]/30 bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]/12'
          : 'border-dashed border-zinc-200/90 bg-zinc-50/80'
      }`}
    >
      {filled && guest ? (
        <div className="flex min-w-0 items-center gap-1">
          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[#ebebeb] bg-zinc-100">
            {guest.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={guest.photo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-zinc-500">
                {(displayFirstName(guest.full_name)[0] ?? '?').toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold leading-tight text-zinc-800">
              {displayFirstName(guest.full_name)}
            </p>
            <p className={`tabular-nums font-semibold leading-none text-zinc-500 ${labelClass}`}>
              {seatNum}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-0.5">
          <span className={`tabular-nums font-semibold text-zinc-400 ${labelClass}`}>
            {seatNum}
          </span>
        </div>
      )}
    </div>
  )
}
