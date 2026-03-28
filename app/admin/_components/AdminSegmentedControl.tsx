'use client'

import type { ReactNode } from 'react'

const GRADIENT = 'bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]'

export type AdminSegmentedOption<T extends string> = { value: T; label: ReactNode }

type Props<T extends string> = {
  options: AdminSegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}

/**
 * Pill segmented control with sliding signature-gradient indicator (admin standard).
 */
export function AdminSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  ariaLabel,
}: Props<T>) {
  const n = options.length
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  const h = size === 'sm' ? 'h-9' : 'h-10'
  const text = size === 'sm' ? 'text-[13px]' : 'text-[14px]'
  const pad = size === 'sm' ? 'px-2.5' : 'px-3'

  const p = 4
  const indicatorWidth =
    n === 2 ? 'calc(50% - 6px)' : `calc(${100 / n}% - ${(2 * p + 2 * (n - 1)) / n}px)`
  const leftPos =
    n === 2
      ? idx === 0
        ? p
        : `calc(50% + 2px)`
      : `calc(${idx * (100 / n)}% + ${p}px + ${idx * 2}px)`

  return (
    <div
      className={`relative inline-flex w-full max-w-full rounded-full border border-[#ebebeb] bg-white p-1 ${h} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      <span
        className={`pointer-events-none absolute bottom-1 top-1 rounded-full ${GRADIENT} transition-[left,width] duration-200 ease-out`}
        style={{
          width: indicatorWidth,
          left: leftPos,
        }}
      />
      <div className="relative z-10 flex min-w-0 flex-1">
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex min-w-0 flex-1 items-center justify-center ${pad} ${text} font-medium transition-colors duration-150 ease-out ${
                active ? 'text-white' : 'text-[#4d4d4d] hover:text-[#171717]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
