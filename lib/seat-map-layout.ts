/** Shared twin-row seat layout: top 1..floor(N/2), bottom floor(N/2)+1..N. */

export const MAX_SEAT_MAP_CAPACITY = 40

export function computeSideCounts(capacity: number): { topCount: number; bottomStart: number } {
  const safe = Math.max(1, Math.trunc(capacity))
  const topCount = Math.floor(safe / 2)
  return { topCount, bottomStart: topCount + 1 }
}

/**
 * Guest map four-side layout: left end-cap → top row → right end-cap → bottom row.
 * Seat 1 is the left cap when capacity ≥ 2; top row starts at 2 when caps apply.
 */
export function computeFourSideCounts(capacity: number): {
  leftEndSeat: number | null
  topStart: number
  topCount: number
  rightEndSeat: number | null
  bottomStart: number
  bottomCount: number
} {
  const safe = Math.max(1, Math.trunc(capacity))

  if (safe === 1) {
    return {
      leftEndSeat: null,
      topStart: 1,
      topCount: 1,
      rightEndSeat: null,
      bottomStart: 2,
      bottomCount: 0,
    }
  }
  if (safe === 2) {
    return {
      leftEndSeat: 1,
      topStart: 2,
      topCount: 0,
      rightEndSeat: 2,
      bottomStart: 3,
      bottomCount: 0,
    }
  }
  if (safe === 3) {
    return {
      leftEndSeat: 1,
      topStart: 2,
      topCount: 1,
      rightEndSeat: 3,
      bottomStart: 4,
      bottomCount: 0,
    }
  }

  const topCount = Math.floor((safe - 2) / 2)
  const topStart = 2
  const rightEndSeat = topStart + topCount
  const bottomStart = rightEndSeat + 1
  const bottomCount = safe - bottomStart + 1

  return {
    leftEndSeat: 1,
    topStart,
    topCount,
    rightEndSeat,
    bottomStart,
    bottomCount,
  }
}

export function seatSizingForSideCounts(
  topCount: number,
  bottomCount: number
): { seatPx: number; gapPx: number } {
  const maxSide = Math.max(topCount, bottomCount, 1)

  if (maxSide >= 18) return { seatPx: 20, gapPx: 4 }
  if (maxSide >= 16) return { seatPx: 22, gapPx: 6 }
  if (maxSide >= 12) return { seatPx: 24, gapPx: 8 }
  if (maxSide >= 8) return { seatPx: 26, gapPx: 9 }
  return { seatPx: 30, gapPx: 10 }
}

export function seatSizing(capacity: number): { seatPx: number; gapPx: number } {
  const { topCount, bottomStart } = computeSideCounts(capacity)
  const bottomCount = capacity - (bottomStart - 1)
  return seatSizingForSideCounts(topCount, bottomCount)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function seatRowTotalWidth(count: number, seatPx: number, gapPx: number): number {
  if (count <= 0) return 0
  return count * seatPx + Math.max(0, count - 1) * gapPx
}

function minSeatPxForCount(sideCount: number): number {
  if (sideCount >= 20) return 12
  if (sideCount >= 16) return 14
  if (sideCount >= 12) return 16
  return 18
}

/** Fit seat size + gap to a measured row width (guest map). */
export function seatSizingForRowWidthWithSideCounts(
  topCount: number,
  bottomCount: number,
  rowWidthPx: number,
  side: 'top' | 'bottom'
): { seatPx: number; gapPx: number } {
  const base = seatSizingForSideCounts(topCount, bottomCount)
  const sideCount = side === 'top' ? topCount : bottomCount
  if (sideCount <= 0 || rowWidthPx <= 0) return base

  const inner = Math.max(0, rowWidthPx - 8)
  const minSeatPx = minSeatPxForCount(sideCount)
  const maxSeatPx = base.seatPx + 6

  for (let seatPx = maxSeatPx; seatPx >= minSeatPx; seatPx--) {
    const remaining = inner - sideCount * seatPx
    const gapPx =
      sideCount <= 1 ? 0 : Math.max(0, Math.floor(remaining / (sideCount - 1)))
    if (seatRowTotalWidth(sideCount, seatPx, gapPx) <= inner) {
      return { seatPx, gapPx }
    }
  }

  const seatPx = minSeatPx
  const gapPx =
    sideCount <= 1
      ? 0
      : Math.max(0, Math.floor((inner - sideCount * seatPx) / (sideCount - 1)))
  return { seatPx, gapPx }
}

/** Fit seat size + gap to a measured row width (guest map). */
export function seatSizingForRowWidth(
  capacity: number,
  rowWidthPx: number,
  side: 'top' | 'bottom'
): { seatPx: number; gapPx: number } {
  const { topCount, bottomStart } = computeSideCounts(capacity)
  const bottomCount = capacity - (bottomStart - 1)
  return seatSizingForRowWidthWithSideCounts(topCount, bottomCount, rowWidthPx, side)
}

/** Guest map: vertical space for label band + outer padding for 50% avatar overlap. */
export function guestTableSeatMapMetrics(
  topSizing: { seatPx: number; gapPx: number },
  bottomSizing: { seatPx: number; gapPx: number },
  endCapSizing?: { seatPx: number }
): {
  edgePaddingTop: number
  edgePaddingBottom: number
  edgePaddingLeft: number
  edgePaddingRight: number
  centerBandPx: number
} {
  const topSeat = topSizing.seatPx
  const bottomSeat = bottomSizing.seatPx
  const endCapSeat = endCapSizing?.seatPx ?? 0
  const maxSeat = Math.max(topSeat, bottomSeat, endCapSeat)
  return {
    edgePaddingTop: Math.ceil(topSeat / 2),
    edgePaddingBottom: Math.ceil(bottomSeat / 2),
    edgePaddingLeft: endCapSeat > 0 ? Math.ceil(endCapSeat / 2) : 0,
    edgePaddingRight: endCapSeat > 0 ? Math.ceil(endCapSeat / 2) : 0,
    // Clear vertical lane between overlapping avatar halves (label stays readable).
    centerBandPx: maxSeat + 30,
  }
}
