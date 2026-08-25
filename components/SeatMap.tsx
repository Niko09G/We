'use client'

import type { CSSProperties, InputHTMLAttributes, Ref } from 'react'
import {
  FLOOR_GRID_COLS,
  FLOOR_GRID_ROWS,
  landmarkBorderRadius,
  landmarkLabelStyle,
  landmarkLineEndpoints,
  type VenueLandmarkRotation,
  type VenueLandmarkShape,
} from '@/lib/floor-layout'

export type SeatMapLandmark = {
  id: string
  name: string
  shape: VenueLandmarkShape
  color: string | null
  left: number
  top: number
  width: number
  height: number
  rotation?: VenueLandmarkRotation
  is_line?: boolean
  grid_x?: number
  grid_y?: number
  width_units?: number
  height_units?: number
}

type SeatMapSearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'placeholder'
> & {
  inputRef?: Ref<HTMLInputElement>
  accentCssVar?: CSSProperties
  className?: string
}

/** Gemini-style rotating gradient ring around the guest map search capsule. */
export function SeatMapSearchInput({
  inputRef,
  accentCssVar,
  className = '',
  ...inputProps
}: SeatMapSearchInputProps) {
  return (
    <div className={`relative ${className}`} style={accentCssVar}>
      <div
        className="pointer-events-none absolute -inset-[2px] overflow-hidden rounded-full"
        aria-hidden
      >
        <div className="seat-map-search-glow absolute inset-[-50%] rounded-full" />
      </div>
      <input
        ref={inputRef}
        placeholder="Search name"
        className={`relative z-10 w-full rounded-full border border-zinc-200/90 bg-zinc-50/90 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors duration-200 focus:border-transparent focus:bg-white ${
          accentCssVar
            ? 'focus:ring-2 focus:ring-[color-mix(in_srgb,var(--viewer-accent)_28%,transparent)]'
            : 'focus:ring-2 focus:ring-violet-200/60'
        }`}
        {...inputProps}
      />
    </div>
  )
}

function lineStrokeColor(color: string | null | undefined): string {
  const c = color?.trim()
  if (c && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) return c
  return '#a1a1aa'
}

type SeatMapLandmarksLayerProps = {
  landmarks: SeatMapLandmark[]
  /** Optional team accent for neutral architectural lines. */
  accentColor?: string | null
}

export function SeatMapLandmarksLayer({ landmarks, accentColor }: SeatMapLandmarksLayerProps) {
  const lineLandmarks = landmarks.filter((lm) => lm.is_line)
  const blockLandmarks = landmarks.filter((lm) => !lm.is_line)

  return (
    <>
      {lineLandmarks.length > 0 ? (
        <svg
          className="pointer-events-none absolute inset-0 z-[4] h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {lineLandmarks.map((lm) => {
            const rect =
              lm.grid_x != null &&
              lm.grid_y != null &&
              lm.width_units != null &&
              lm.height_units != null
                ? {
                    grid_x: lm.grid_x,
                    grid_y: lm.grid_y,
                    width_units: lm.width_units,
                    height_units: lm.height_units,
                  }
                : {
                    grid_x: Math.round((lm.left / 100) * FLOOR_GRID_COLS),
                    grid_y: Math.round((lm.top / 100) * FLOOR_GRID_ROWS),
                    width_units: Math.max(
                      1,
                      Math.round((lm.width / 100) * FLOOR_GRID_COLS)
                    ),
                    height_units: Math.max(
                      1,
                      Math.round((lm.height / 100) * FLOOR_GRID_ROWS)
                    ),
                  }
            const { x1, y1, x2, y2 } = landmarkLineEndpoints(rect)
            const stroke = lineStrokeColor(lm.color ?? accentColor)
            return (
              <line
                key={lm.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={0.35}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.92}
              />
            )
          })}
        </svg>
      ) : null}

      {blockLandmarks.map((lm) => {
        const rotation = lm.rotation ?? 0
        const labelStyle = landmarkLabelStyle(rotation)
        return (
          <div
            key={lm.id}
            className="absolute z-[5] box-border overflow-hidden border border-zinc-200/90 px-1.5 py-1 text-center text-[10px] font-medium tracking-wide text-zinc-600 shadow-sm"
            style={{
              left: `${lm.left}%`,
              top: `${lm.top}%`,
              width: `${lm.width}%`,
              height: `${lm.height}%`,
              backgroundColor: lm.color ?? '#ffffff',
              borderRadius: landmarkBorderRadius(lm.shape),
            }}
          >
            <span
              className="flex h-full w-full items-center justify-center leading-tight"
              style={labelStyle}
            >
              {lm.name}
            </span>
          </div>
        )
      })}
    </>
  )
}
