'use client'

import { useLayoutEffect, useRef, useState } from 'react'

import type { AttendeeRow } from '@/lib/admin-attendees'
import {
  clamp,
  computeFourSideCounts,
  guestTableSeatMapMetrics,
  MAX_SEAT_MAP_CAPACITY,
  seatSizingForRowWidthWithSideCounts,
  seatSizingForSideCounts,
} from '@/lib/seat-map-layout'
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

export function AttendeeSeatAvatar({
  attendee,
  size = 28,
  className = '',
}: {
  attendee: AttendeeRow
  size?: number
  className?: string
}) {
  const dim = `${size}px`
  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full border border-[#ebebeb] bg-zinc-100 ${className}`}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      {attendee.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attendee.photo_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-500">
          {initialsFromName(attendee.full_name)}
        </span>
      )}
    </div>
  )
}

function partyGroupSeatingComplete(p: SeatingParty): boolean {
  if (p.members.length <= 1) return true
  const tid = p.uniformTableId
  if (!tid) return false
  return p.members.every(
    (m) =>
      m.table_id === tid &&
      typeof m.seat_number === 'number' &&
      Number.isFinite(m.seat_number)
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

type SeatMapSharedProps = {
  bySeat: Map<number, AttendeeRow>
  partiesOnTable: SeatingParty[]
  highlightPartyKey: string | null
  previewSeatRange: SeatRange | null
  previewGhostInitials: string[]
  partyForSeat: (seatNum: number) => SeatingParty | undefined
  showSeatNames: boolean
  isLarge: boolean
  onSeatClick:
    | ((seatNum: number, guest: AttendeeRow | null, anchor: DOMRectReadOnly) => void)
    | null
  lockedSeatNums: ReadonlySet<number> | null
}

function seatRangeOccupied(
  n: number,
  bySeat: Map<number, AttendeeRow>,
  previewSeatRange: SeatRange | null
) {
  const filled = bySeat.has(n)
  const inPreview =
    previewSeatRange != null && n >= previewSeatRange.minSeat && n <= previewSeatRange.maxSeat
  return { filled, inPreview }
}

function AdminSeatBubble({
  seatNum,
  seatPx,
  guest,
  party,
  filled,
  inPreview,
  ghostInitial,
  showSeatNames,
  namePlacement,
  isActiveGroup,
  isLocked,
  onSeatClick,
}: {
  seatNum: number
  seatPx: number
  guest: AttendeeRow | undefined
  party: SeatingParty | undefined
  filled: boolean
  inPreview: boolean
  ghostInitial: string
  showSeatNames: boolean
  namePlacement: 'above' | 'below' | 'none'
  isActiveGroup: boolean
  isLocked: boolean
  onSeatClick:
    | ((seatNum: number, guest: AttendeeRow | null, anchor: DOMRectReadOnly) => void)
    | null
}) {
  const title = guest
    ? `Seat ${seatNum} · ${guest.full_name}${party ? ` · ${party.title}` : ''}`
    : inPreview
      ? `Seat ${seatNum} · preview`
      : `Seat ${seatNum} · empty`

  const ringClass = isActiveGroup ? 'ring-2 ring-[#5b38f2]/25' : ''

  const seatClass = isLocked
    ? 'border-zinc-500/50 bg-zinc-200/50'
    : inPreview
      ? 'border-[#5b38f2]/60 bg-[#5b38f2]/12'
      : filled
        ? 'border-[#5b38f2]/30 bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]/10'
        : 'border-dashed border-zinc-200/70 bg-zinc-50/55'

  return (
    <div className="relative flex flex-col items-center">
      {showSeatNames && guest && namePlacement === 'above' ? (
        <span className="absolute -top-5 max-w-[88px] truncate text-center text-[10px] font-medium text-zinc-600">
          {guest.full_name.split(/\s+/)[0] ?? guest.full_name}
        </span>
      ) : null}
      <div
        title={title}
        role={onSeatClick ? 'button' : undefined}
        tabIndex={onSeatClick ? 0 : undefined}
        onKeyDown={
          onSeatClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSeatClick(
                    seatNum,
                    guest ?? null,
                    (e.currentTarget as HTMLElement).getBoundingClientRect()
                  )
                }
              }
            : undefined
        }
        onClick={
          onSeatClick
            ? (e) => {
                e.preventDefault()
                e.stopPropagation()
                onSeatClick(
                  seatNum,
                  guest ?? null,
                  (e.currentTarget as HTMLElement).getBoundingClientRect()
                )
              }
            : undefined
        }
        data-seat-control
        className={`flex items-center justify-center rounded-full border ${seatClass} ${ringClass} ${onSeatClick ? 'cursor-pointer transition-transform hover:scale-[1.04]' : ''}`}
        style={{ width: seatPx, height: seatPx }}
      >
        {guest ? (
          guest.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guest.photo_url} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="text-[10px] font-semibold text-zinc-900">
              {initialsFromName(guest.full_name)}
            </span>
          )
        ) : inPreview ? (
          <span className="text-[10px] font-semibold text-zinc-700/80">{ghostInitial}</span>
        ) : (
          <span className="text-[10px] font-semibold text-zinc-400">{seatNum}</span>
        )}
        {isLocked ? (
          <span
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-800 text-[7px] font-bold text-white"
            aria-hidden
          >
            L
          </span>
        ) : null}
      </div>
      {showSeatNames && guest && namePlacement === 'below' ? (
        <span className="mt-1 max-w-[88px] truncate text-center text-[10px] font-medium text-zinc-600">
          {guest.full_name.split(/\s+/)[0] ?? guest.full_name}
        </span>
      ) : null}
    </div>
  )
}

function EndCapSeat({
  seatNum,
  seatPx,
  shared,
}: {
  seatNum: number
  seatPx: number
  shared: SeatMapSharedProps
}) {
  const guest = shared.bySeat.get(seatNum)
  const party = shared.partyForSeat(seatNum)
  const { filled, inPreview } = seatRangeOccupied(
    seatNum,
    shared.bySeat,
    shared.previewSeatRange
  )
  const isActiveGroup =
    party != null && shared.highlightPartyKey != null && party.key === shared.highlightPartyKey
  const ghostInitial =
    shared.previewGhostInitials[
      (seatNum + shared.previewGhostInitials.length) % Math.max(1, shared.previewGhostInitials.length)
    ] ?? '?'

  return (
    <AdminSeatBubble
      seatNum={seatNum}
      seatPx={seatPx}
      guest={guest}
      party={party}
      filled={filled}
      inPreview={inPreview}
      ghostInitial={ghostInitial}
      showSeatNames={shared.showSeatNames}
      namePlacement={shared.showSeatNames && guest ? 'above' : 'none'}
      isActiveGroup={isActiveGroup}
      isLocked={shared.lockedSeatNums?.has(seatNum) ?? false}
      onSeatClick={shared.onSeatClick}
    />
  )
}

export function AdminTableTwinSeatMap({
  capacity,
  attendeesAtTable,
  partiesOnTable = [],
  highlightPartyKey = null,
  previewSeatRange = null,
  previewGhostMembers = null,
  size = 'compact',
  showSeatNames = false,
  onSeatClick = null,
  lockedSeatNums = null,
}: {
  capacity: number
  attendeesAtTable: AttendeeRow[]
  partiesOnTable?: SeatingParty[]
  highlightPartyKey?: string | null
  previewSeatRange?: SeatRange | null
  previewGhostMembers?: AttendeeRow[] | null
  size?: 'compact' | 'large'
  showSeatNames?: boolean
  /** Precision UX (e.g. large overlay): click seat to assign. Coexists with map drag/drop elsewhere. */
  onSeatClick?:
    | ((seatNum: number, guest: AttendeeRow | null, anchor: DOMRectReadOnly) => void)
    | null
  /** Seat numbers locked for assignment (session UI; persist later). */
  lockedSeatNums?: ReadonlySet<number> | null
}) {
  const middleRef = useRef<HTMLDivElement>(null)
  const [middleW, setMiddleW] = useState(0)

  const safeCapacity = Math.min(MAX_SEAT_MAP_CAPACITY, Math.max(1, Math.trunc(capacity)))

  useLayoutEffect(() => {
    const el = middleRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setMiddleW(el.clientWidth))
    ro.observe(el)
    setMiddleW(el.clientWidth)
    return () => ro.disconnect()
  }, [safeCapacity])

  const bySeat = new Map<number, AttendeeRow>()
  for (const r of attendeesAtTable) {
    const n = r.seat_number
    if (typeof n === 'number' && Number.isFinite(n)) {
      const sn = Math.trunc(n)
      if (sn >= 1 && sn <= safeCapacity) bySeat.set(sn, r)
    }
  }

  const {
    leftEndSeat,
    topStart,
    topCount,
    rightEndSeat,
    bottomStart,
    bottomCount,
  } = computeFourSideCounts(safeCapacity)

  const topEnd = topCount > 0 ? topStart + topCount - 1 : topStart - 1
  const bottomEnd = bottomCount > 0 ? bottomStart + bottomCount - 1 : bottomStart - 1

  const baseSizing = seatSizingForSideCounts(topCount, bottomCount)
  const topSizing =
    middleW > 0 && topCount > 0
      ? seatSizingForRowWidthWithSideCounts(topCount, bottomCount, middleW, 'top')
      : baseSizing
  const bottomSizing =
    middleW > 0 && bottomCount > 0
      ? seatSizingForRowWidthWithSideCounts(topCount, bottomCount, middleW, 'bottom')
      : baseSizing

  const largeBoost = size === 'large' ? 8 : 0
  let effectiveSeatPxTop = Math.min(
    size === 'large' ? 58 : topSizing.seatPx,
    topSizing.seatPx + largeBoost
  )
  let effectiveSeatPxBottom = Math.min(
    size === 'large' ? 58 : bottomSizing.seatPx,
    bottomSizing.seatPx + largeBoost
  )
  const effectiveGapPxTop = topSizing.gapPx + (size === 'large' ? 2 : 0)
  const effectiveGapPxBottom = bottomSizing.gapPx + (size === 'large' ? 2 : 0)

  if (middleW > 0) {
    const minPx = size === 'large' ? 26 : 12
    if (topCount > 0) {
      const needed =
        topCount * effectiveSeatPxTop + Math.max(0, topCount - 1) * effectiveGapPxTop
      if (needed > middleW) {
        effectiveSeatPxTop = clamp(
          Math.floor(
            (middleW - Math.max(0, topCount - 1) * effectiveGapPxTop) / topCount
          ),
          minPx,
          effectiveSeatPxTop
        )
      }
    }
    if (bottomCount > 0) {
      const needed =
        bottomCount * effectiveSeatPxBottom +
        Math.max(0, bottomCount - 1) * effectiveGapPxBottom
      if (needed > middleW) {
        effectiveSeatPxBottom = clamp(
          Math.floor(
            (middleW - Math.max(0, bottomCount - 1) * effectiveGapPxBottom) / bottomCount
          ),
          minPx,
          effectiveSeatPxBottom
        )
      }
    }
  }

  const endCapSeatPx = Math.max(effectiveSeatPxTop, effectiveSeatPxBottom)
  const layoutMetrics = guestTableSeatMapMetrics(
    { seatPx: effectiveSeatPxTop, gapPx: effectiveGapPxTop },
    { seatPx: effectiveSeatPxBottom, gapPx: effectiveGapPxBottom },
    {
      seatPx:
        leftEndSeat != null || rightEndSeat != null ? endCapSeatPx : 0,
    }
  )

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

  const shared: SeatMapSharedProps = {
    bySeat,
    partiesOnTable,
    highlightPartyKey,
    previewSeatRange,
    previewGhostInitials,
    partyForSeat,
    showSeatNames,
    isLarge: size === 'large',
    onSeatClick,
    lockedSeatNums,
  }

  const rowWidthTop =
    Math.max(0, topCount) * effectiveSeatPxTop +
    Math.max(0, topCount - 1) * effectiveGapPxTop
  const rowWidthBottom =
    Math.max(0, bottomCount) * effectiveSeatPxBottom +
    Math.max(0, bottomCount - 1) * effectiveGapPxBottom

  return (
    <div className="w-full min-w-0 rounded-none bg-transparent p-0">
      <div
        className="grid w-full min-w-0 grid-cols-[auto_1fr_auto] items-center gap-x-1"
        style={{
          paddingTop: layoutMetrics.edgePaddingTop,
          paddingBottom: layoutMetrics.edgePaddingBottom,
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center self-stretch"
          style={{ width: leftEndSeat != null ? endCapSeatPx : 0 }}
        >
          {leftEndSeat != null ? (
            <EndCapSeat seatNum={leftEndSeat} seatPx={endCapSeatPx} shared={shared} />
          ) : null}
        </div>

        <div ref={middleRef} className="min-w-0 self-stretch">
          <div
            className="flex min-w-0 flex-col gap-1"
            style={{ minHeight: layoutMetrics.centerBandPx }}
          >
            <SideRow
              sideName="top"
              sideStart={topStart}
              sideEnd={topEnd}
              rowWidth={rowWidthTop}
              seatPx={effectiveSeatPxTop}
              gapPx={effectiveGapPxTop}
              shared={shared}
            />
            <SideRow
              sideName="bottom"
              sideStart={bottomStart}
              sideEnd={bottomEnd}
              rowWidth={rowWidthBottom}
              seatPx={effectiveSeatPxBottom}
              gapPx={effectiveGapPxBottom}
              shared={shared}
            />
          </div>
        </div>

        <div
          className="flex shrink-0 items-center justify-center self-stretch"
          style={{ width: rightEndSeat != null ? endCapSeatPx : 0 }}
        >
          {rightEndSeat != null ? (
            <EndCapSeat seatNum={rightEndSeat} seatPx={endCapSeatPx} shared={shared} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SideRow({
  sideName,
  sideStart,
  sideEnd,
  rowWidth,
  seatPx,
  gapPx,
  shared,
}: {
  sideName: 'top' | 'bottom'
  sideStart: number
  sideEnd: number
  rowWidth: number
  seatPx: number
  gapPx: number
  shared: SeatMapSharedProps
}) {
  const count = Math.max(0, sideEnd - sideStart + 1)
  if (count <= 0) {
    return <div className="h-[30px]" aria-hidden />
  }

  const {
    bySeat,
    partiesOnTable,
    highlightPartyKey,
    previewSeatRange,
    previewGhostInitials,
    partyForSeat,
    showSeatNames,
    isLarge,
    onSeatClick,
    lockedSeatNums,
  } = shared

  return (
    <div className="relative w-full min-w-0">
      <div className="mx-auto flex w-full max-w-full items-center justify-center">
        <div
          className={`relative shrink-0 ${isLarge ? 'h-[108px]' : 'h-[72px]'}`}
          style={{ width: rowWidth, maxWidth: '100%' }}
        >
          {partiesOnTable.map((p) => {
            if (p.minSeat == null || p.maxSeat == null) return null
            if (p.members.length <= 1) return null
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
            const linkedComplete = partyGroupSeatingComplete(p)
            const colorClass =
              linkedComplete && !isSplit
                ? isActive
                  ? 'border-emerald-500/95'
                  : 'border-emerald-500/55'
                : isActive
                  ? isSplit
                    ? 'border-amber-500/90'
                    : 'border-[#5b38f2]/90'
                  : isSplit
                    ? 'border-amber-300/70'
                    : 'border-zinc-300/80'

            const centerSeat = (p.minSeat + p.maxSeat) / 2
            const showLabel =
              width >= seatPx * 2 && centerSeat >= sideStart && centerSeat <= sideEnd

            return (
              <div
                key={p.key}
                className="pointer-events-none absolute"
                style={{ left, top: 0, width }}
              >
                <div className={`absolute left-0 top-0 h-3 w-0 border-l-2 ${colorClass}`} />
                <div className={`absolute right-0 top-0 h-3 w-0 border-r-2 ${colorClass}`} />
                <div className={`absolute left-0 top-0 h-0.5 w-full border-t-2 ${colorClass}`} />
                {showLabel ? (
                  <span
                    className={`absolute -top-2 left-1/2 max-w-[86px] -translate-x-1/2 -translate-y-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm ${
                      isActive ? 'bg-white text-zinc-800' : 'bg-white text-zinc-700'
                    }`}
                  >
                    {p.title}
                  </span>
                ) : null}
              </div>
            )
          })}

          <div
            className={`absolute left-0 flex items-center justify-start ${isLarge ? 'top-8' : 'top-5'}`}
            style={{ gap: `${gapPx}px` }}
          >
            {Array.from({ length: count }, (_, i) => {
              const seatNum = sideStart + i
              const guest = bySeat.get(seatNum)
              const party = partyForSeat(seatNum)
              const { filled, inPreview } = seatRangeOccupied(seatNum, bySeat, previewSeatRange)
              const isActiveGroup =
                party != null && highlightPartyKey != null && party.key === highlightPartyKey
              const ghostInitial =
                previewGhostInitials[
                  (seatNum + previewGhostInitials.length) %
                    Math.max(1, previewGhostInitials.length)
                ] ?? '?'

              return (
                <AdminSeatBubble
                  key={seatNum}
                  seatNum={seatNum}
                  seatPx={seatPx}
                  guest={guest}
                  party={party}
                  filled={filled}
                  inPreview={inPreview}
                  ghostInitial={ghostInitial}
                  showSeatNames={showSeatNames}
                  namePlacement={
                    showSeatNames && guest
                      ? sideName === 'top'
                        ? 'above'
                        : 'below'
                      : 'none'
                  }
                  isActiveGroup={isActiveGroup}
                  isLocked={lockedSeatNums?.has(seatNum) ?? false}
                  onSeatClick={onSeatClick}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
