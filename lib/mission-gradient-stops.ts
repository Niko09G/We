import { normalizeHex } from '@/lib/admin-color-picker'

export function extractHexStopsFromCssGradient(css: string): string[] {
  const matches = [...css.matchAll(/#([0-9a-fA-F]{3,6})\b/gi)]
  const out: string[] = []
  for (const x of matches) {
    const h = normalizeHex(`#${x[1]}`)
    if (h) out.push(h)
  }
  return out
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex)
  if (!n) return null
  const raw = n.slice(1)
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  }
}

function mixHex(a: string, b: string, t: number): string {
  const A = parseRgb(a)
  const B = parseRgb(b)
  if (!A || !B) return a
  const r = Math.round(A.r + (B.r - A.r) * t)
  const g = Math.round(A.g + (B.g - A.g) * t)
  const bl = Math.round(A.b + (B.b - A.b) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

export function tripleStopsFromGradientCss(css: string): { top: string; mid: string; bottom: string } {
  const list = extractHexStopsFromCssGradient(css)
  if (list.length === 0) return { top: '#6366f1', mid: '#818cf8', bottom: '#c7d2fe' }
  if (list.length === 1) {
    const x = list[0]!
    return { top: x, mid: x, bottom: x }
  }
  if (list.length === 2) {
    return { top: list[0]!, mid: mixHex(list[0]!, list[1]!, 0.5), bottom: list[1]! }
  }
  return {
    top: list[0]!,
    mid: list[Math.floor((list.length - 1) / 2)]!,
    bottom: list[list.length - 1]!,
  }
}

export function missionGradientCssFromTriple(top: string, mid: string, bottom: string): string {
  const a = normalizeHex(top) ?? top
  const b = normalizeHex(mid) ?? mid
  const c = normalizeHex(bottom) ?? bottom
  return `linear-gradient(to bottom, ${a}, ${b}, ${c})`
}
