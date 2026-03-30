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
export function avatarMembersForPartyStrip(
  members: AttendeeRow[],
  max = 2
): AttendeeRow[] {
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

function initialsFromName(fullName: string): string {
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0]?.[0] ?? '?'
  return first.toUpperCase()
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
                {initialsFromName(m.full_name)}
              </span>
            )}
          </div>
        ))}
      </div>
      {rest > 0 ? (
        <span className="ml-1 text-[11px] font-semibold tabular-nums text-zinc-500">
          +{rest}
        </span>
      ) : null}
    </div>
  )
}

type SeatRange = { minSeat: number; maxSeat: number }

function computeSideCounts(capacity: number): { topCount: number; bottomStart: number } {
  const topCount = Math.floor(capacity / 2)
  return { topCount, bottomStart: topCount + 1 }
}

function seatSizing(capacity: number): { seatPx: number; gapPx: number } {
  const { topCount, bottomStart } = computeSideCounts(capacity)
  const bottomCount = capacity - (bottomStart - 1)
  const maxSide = Math.max(topCount, bottomCount, 1)

  // Bias larger so map uses table-card width more effectively.
  if (maxSide >= 16) return { seatPx: 22, gapPx: 8 }
  if (maxSide >= 12) return { seatPx: 24, gapPx: 9 }
  if (maxSide >= 8) return { seatPx: 26, gapPx: 9 }
  return { seatPx: 30, gapPx: 10 }
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n))
}

export function AdminTableTwinSeatMap({
  capacity,
  attendeesAtTable,
  partiesOnTable = [],
  highlightPartyKey = null,
  previewSeatRange = null,
  previewGhostMembers = null,
}: {
  capacity: number
  attendeesAtTable: AttendeeRow[]
  partiesOnTable?: SeatingParty[]
  highlightPartyKey?: string | null
  previewSeatRange?: SeatRange | null
  previewGhostMembers?: AttendeeRow[] | null
}) {
  const bySeat = new Map<number, AttendeeRow>()
  for (const r of attendeesAtTable) {
    const n = r.seat_number
    if (typeof n === 'number' && Number.isFinite(n)) {
      const sn = Math.trunc(n)
      if (sn >= 1 && sn <= capacity) bySeat.set(sn, r)
    }
  }

  const { topCount, bottomStart } = computeSideCounts(capacity)
  const bottomCount = capacity - (bottomStart - 1)
  const { seatPx, gapPx } = seatSizing(capacity)
  const previewGhostInitials = (previewGhostMembers ?? []).map((m) =>
    initialsFromName(m.full_name)
  )

  const partyForSeat = (seatNum: number): SeatingParty | undefined => {
    for (const p of partiesOnTable) {
      if (p.minSeat == null || p.maxSeat == null) continue
      if (seatNum >= p.minSeat && seatNum <= p.maxSeat) return p
    }
    return undefined
  }

  const rowWidthTop = Math.max(0, topCount) * seatPx + Math.max(0, topCount - 1) * gapPx
  const rowWidthBottom =
    Math.max(0, bottomCount) * seatPx + Math.max(0, bottomCount - 1) * gapPx

  return (
    <div className="w-full rounded-none bg-transparent p-0">
      <div className="grid gap-1">
        {/* Top row: 1 → N/2 */}
        <SideRow
          sideStart={1}
          sideEnd={topCount}
          rowWidth={rowWidthTop}
          seatPx={seatPx}
          gapPx={gapPx}
          bySeat={bySeat}
          partiesOnTable={partiesOnTable}
          highlightPartyKey={highlightPartyKey}
          previewSeatRange={previewSeatRange}
          previewGhostInitials={previewGhostInitials}
          partyForSeat={partyForSeat}
        />

        {/* Bottom row: N/2+1 → N */}
        <SideRow
          sideStart={bottomStart}
          sideEnd={capacity}
          rowWidth={rowWidthBottom}
          seatPx={seatPx}
          gapPx={gapPx}
          bySeat={bySeat}
          partiesOnTable={partiesOnTable}
          highlightPartyKey={highlightPartyKey}
          previewSeatRange={previewSeatRange}
          previewGhostInitials={previewGhostInitials}
          partyForSeat={partyForSeat}
        />
      </div>
    </div>
  )
}

function SideRow({
  sideStart,
  sideEnd,
  rowWidth,
  seatPx,
  gapPx,
  bySeat,
  partiesOnTable,
  highlightPartyKey,
  previewSeatRange,
  previewGhostInitials,
  partyForSeat,
}: {
  sideStart: number
  sideEnd: number
  rowWidth: number
  seatPx: number
  gapPx: number
  bySeat: Map<number, AttendeeRow>
  partiesOnTable: SeatingParty[]
  highlightPartyKey: string | null
  previewSeatRange: SeatRange | null
  previewGhostInitials: string[]
  partyForSeat: (seatNum: number) => SeatingParty | undefined
}) {
  const count = Math.max(0, sideEnd - sideStart + 1)
  if (count <= 0) {
    return <div className="h-[30px]" aria-hidden />
  }

  const seatRangeOccupied = (n: number) => {
    const filled = bySeat.has(n)
    const inPreview =
      previewSeatRange != null && n >= previewSeatRange.minSeat && n <= previewSeatRange.maxSeat
    return { filled, inPreview }
  }

  return (
    <div className="relative w-full">
      <div
        className="flex w-full items-center justify-start"
        style={{ width: rowWidth }}
      >
        <div className="relative h-[72px] w-full">
          {/* Party brackets */}
          {partiesOnTable.map((p) => {
            if (p.minSeat == null || p.maxSeat == null) return null
            const overlapStart = clamp(p.minSeat, sideStart, sideEnd)
            const overlapEnd = clamp(p.maxSeat, sideStart, sideEnd)
            if (overlapStart > overlapEnd) return null

            const localStartIdx = overlapStart - sideStart
            const localEndIdx = overlapEnd - sideStart
            const left = localStartIdx * (seatPx + gapPx)
            const width =
              (localEndIdx - localStartIdx + 1) * seatPx +
              (localEndIdx - localStartIdx) * gapPx

            const isActive = highlightPartyKey != null && p.key === highlightPartyKey
            const isSplit = p.splitWarning
            const colorClass = isActive
              ? isSplit
                ? 'border-amber-500/90'
                : 'border-[#5b38f2]/90'
              : isSplit
                ? 'border-amber-300/70'
                : 'border-zinc-300/80'

            const centerSeat = (p.minSeat + p.maxSeat) / 2
            const showLabel = width >= seatPx * 2 && centerSeat >= sideStart && centerSeat <= sideEnd

            return (
              <div
                key={p.key}
                className="pointer-events-none absolute"
                style={{ left, top: 0, width }}
              >
                <div className={`absolute left-0 top-0 h-3 w-0 border-l-2 ${colorClass}`} />
                <div className={`absolute right-0 top-0 h-3 w-0 border-r-2 ${colorClass}`} />
                <div
                  className={`absolute left-0 top-0 h-0.5 w-full border-t-2 ${colorClass}`}
                />
                {showLabel ? (
                  <span
                    className={`absolute -top-2 left-1/2 -translate-x-1/2 max-w-[86px] -translate-y-0 whitespace-nowrap overflow-hidden text-ellipsis rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm ${
                      isActive
                        ? 'bg-white text-zinc-800'
                        : 'bg-white/70 text-zinc-500'
                    }`}
                  >
                    {p.title}
                  </span>
                ) : null}
              </div>
            )
          })}

          {/* Seats */}
          <div
            className="absolute left-0 top-5 flex items-center justify-start"
            style={{ gap: `${gapPx}px` }}
          >
            {Array.from({ length: count }, (_, i) => {
              const seatNum = sideStart + i
              const guest = bySeat.get(seatNum)
              const party = partyForSeat(seatNum)
              const { filled, inPreview } = seatRangeOccupied(seatNum)
              const isActiveGroup = party != null && highlightPartyKey != null && party.key === highlightPartyKey
              const ghostInitial = previewGhostInitials[(seatNum + previewGhostInitials.length) % Math.max(1, previewGhostInitials.length)] ?? '?'

              const title = guest
                ? `Seat ${seatNum} · ${guest.full_name}${party ? ` · ${party.title}` : ''}`
                : inPreview
                  ? `Seat ${seatNum} · preview`
                  : `Seat ${seatNum} · empty`

              const ringClass = isActiveGroup
                ? 'ring-2 ring-[#5b38f2]/25'
                : ''

              const seatClass = inPreview
                ? 'border-[#5b38f2]/60 bg-[#5b38f2]/12'
                : filled
                  ? 'border-[#5b38f2]/30 bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]/10'
                  : 'border-dashed border-zinc-200/70 bg-zinc-50/55'

              return (
                <div
                  key={seatNum}
                  title={title}
                  className={`flex items-center justify-center rounded-full border ${seatClass} ${ringClass}`}
                  style={{ width: seatPx, height: seatPx }}
                >
                  {guest ? (
                    guest.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={guest.photo_url}
                        alt=""
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-semibold text-zinc-900">
                        {initialsFromName(guest.full_name)}
                      </span>
                    )
                  ) : inPreview ? (
                    <span className="text-[10px] font-semibold text-zinc-700/80">
                      {ghostInitial}
                    </span>
                  ) : (
                    <span className={`text-[10px] font-semibold text-zinc-400`}>
                      {seatNum}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
