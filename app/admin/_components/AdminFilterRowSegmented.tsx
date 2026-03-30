'use client'

import type { ReactNode } from 'react'

const TRACK =
  'inline-flex h-10 items-stretch overflow-hidden rounded-full border border-[#ebebeb] bg-white'
const BTN =
  'inline-flex h-full cursor-pointer items-center rounded-full px-[12px] text-[14px] font-medium transition-colors duration-150 ease-out'
const BTN_ON = 'bg-black text-white'
const BTN_OFF = 'text-[#4d4d4d] hover:text-[#171717]'

type Props<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode }[]
  ariaLabel?: string
  className?: string
}

/**
 * Same segmented control as the Missions library filter row (Cards / List):
 * flush active fill, full rounding, shared border shell.
 */
export function AdminFilterRowSegmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`${TRACK} ${className}`.trim()}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`${BTN} ${active ? BTN_ON : BTN_OFF}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
