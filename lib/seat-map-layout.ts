/** Shared twin-row seat layout: top 1..floor(N/2), bottom floor(N/2)+1..N. */

export const MAX_SEAT_MAP_CAPACITY = 40

export function computeSideCounts(capacity: number): { topCount: number; bottomStart: number } {
  const safe = Math.max(1, Math.trunc(capacity))
  const topCount = Math.floor(safe / 2)
  return { topCount, bottomStart: topCount + 1 }
}

export function seatSizing(capacity: number): { seatPx: number; gapPx: number } {
  const { topCount, bottomStart } = computeSideCounts(capacity)
  const bottomCount = capacity - (bottomStart - 1)
  const maxSide = Math.max(topCount, bottomCount, 1)

  if (maxSide >= 18) return { seatPx: 20, gapPx: 4 }
  if (maxSide >= 16) return { seatPx: 22, gapPx: 6 }
  if (maxSide >= 12) return { seatPx: 24, gapPx: 8 }
  if (maxSide >= 8) return { seatPx: 26, gapPx: 9 }
  return { seatPx: 30, gapPx: 10 }
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
export function seatSizingForRowWidth(
  capacity: number,
  rowWidthPx: number,
  side: 'top' | 'bottom'
): { seatPx: number; gapPx: number } {
  const base = seatSizing(capacity)
  const { topCount, bottomStart } = computeSideCounts(capacity)
  const sideCount = side === 'top' ? topCount : capacity - (bottomStart - 1)
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

/** Guest map: vertical space for label band + outer padding for 50% avatar overlap. */
export function guestTableSeatMapMetrics(
  topSizing: { seatPx: number; gapPx: number },
  bottomSizing: { seatPx: number; gapPx: number }
): {
  edgePaddingTop: number
  edgePaddingBottom: number
  centerBandPx: number
} {
  const topSeat = topSizing.seatPx
  const bottomSeat = bottomSizing.seatPx
  const maxSeat = Math.max(topSeat, bottomSeat)
  return {
    edgePaddingTop: Math.ceil(topSeat / 2),
    edgePaddingBottom: Math.ceil(bottomSeat / 2),
    // Clear vertical lane between overlapping avatar halves (label stays readable).
    centerBandPx: maxSeat + 30,
  }
}
