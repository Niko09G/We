'use client'

import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import { clamp } from '@/lib/admin-color-picker'

export type AdminPickerHsv = { h: number; s: number; v: number }

type Props = {
  open: boolean
  position: { left: number; top: number } | null
  pickerRef: RefObject<HTMLDivElement | null>
  svPanelRef: RefObject<HTMLDivElement | null>
  pickerHsv: AdminPickerHsv
  pickerHex: string
  onHueChange: (h: number) => void
  onSvPanelMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
  onHexInputChange: (raw: string) => void
}

/**
 * Fixed-position HSV + hex picker rendered via portal (same UI as Table builder customize).
 */
export function AdminBuilderColorPickerPortal({
  open,
  position,
  pickerRef,
  svPanelRef,
  pickerHsv,
  pickerHex,
  onHueChange,
  onSvPanelMouseDown,
  onHexInputChange,
}: Props) {
  if (!open || !position || typeof window === 'undefined') return null

  return createPortal(
    <div
      ref={pickerRef}
      className="fixed z-[80] w-52 -translate-x-1/2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-md"
      style={{ left: position.left, top: position.top }}
    >
      <div
        ref={svPanelRef}
        className="relative h-36 w-full cursor-crosshair"
        style={{ backgroundColor: `hsl(${pickerHsv.h} 100% 50%)` }}
        onMouseDown={onSvPanelMouseDown}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{
            left: `${pickerHsv.s * 100}%`,
            top: `${(1 - pickerHsv.v) * 100}%`,
          }}
        />
      </div>
      <div className="space-y-2 border-t border-zinc-100 p-3">
        <input
          type="range"
          min={0}
          max={360}
          value={pickerHsv.h}
          onChange={(e) => onHueChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-violet-600"
          aria-label="Hue"
        />
        <div className="flex items-center gap-2">
          <span
            className="h-6 w-6 shrink-0 rounded-md border border-zinc-200"
            style={{ backgroundColor: pickerHex }}
            aria-hidden
          />
          <input
            value={pickerHex}
            onChange={(e) => onHexInputChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-700"
            aria-label="Hex color"
          />
        </div>
      </div>
    </div>,
    document.body
  )
}

export function computePickerAnchorPosition(el: HTMLButtonElement): { left: number; top: number } {
  const rect = el.getBoundingClientRect()
  const popoverWidth = 208
  const edgePadding = 12
  const left = clamp(
    rect.left + rect.width / 2,
    edgePadding + popoverWidth / 2,
    window.innerWidth - edgePadding - popoverWidth / 2
  )
  const top = clamp(rect.bottom + 10, edgePadding, window.innerHeight - 260)
  return { left, top }
}
