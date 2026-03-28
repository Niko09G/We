'use client'

import type { ReactNode } from 'react'
import { AdminDropdown } from '@/app/admin/_components/AdminDropdown'

export type AdminSelectOption<T extends string = string> = {
  value: T
  label: ReactNode
}

const DEFAULT_BUTTON =
  'inline-flex h-10 w-auto min-w-0 max-w-full shrink-0 items-center justify-between gap-2 rounded-full border border-[#ebebeb] bg-white px-3 pr-2.5 text-left text-[14px] font-medium text-[#171717] outline-none transition-colors hover:border-zinc-300'

type Props<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: AdminSelectOption<T>[]
  /** Override trigger contents; defaults to the selected option’s `label`. */
  renderValue?: (selected: AdminSelectOption<T> | undefined) => ReactNode
  buttonClassName?: string
  align?: 'left' | 'right'
  className?: string
  menuItemClassName?: string
}

/**
 * Opinionated select built on {@link AdminDropdown} — matches Mission Builder currency control
 * (rounded-full trigger, chevron, shadow menu).
 */
export function AdminSelectDropdown<T extends string>({
  value,
  onChange,
  options,
  renderValue,
  buttonClassName,
  align = 'left',
  className = '',
  menuItemClassName = 'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[14px] font-medium text-[#171717] hover:bg-zinc-50',
}: Props<T>) {
  const selected = options.find((o) => o.value === value)

  return (
    <AdminDropdown
      className={className}
      align={align}
      buttonClassName={buttonClassName ?? DEFAULT_BUTTON}
      trigger={
        <>
          <span className="min-w-0 flex-1 truncate">{renderValue ? renderValue(selected) : selected?.label}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4 shrink-0 text-zinc-400"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </>
      }
    >
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={menuItemClassName}
        >
          <span className="min-w-0 flex-1 text-left">{opt.label}</span>
          {opt.value === value ? (
            <span className="shrink-0 text-[12px] font-semibold text-zinc-400" aria-hidden>
              ✓
            </span>
          ) : null}
        </button>
      ))}
    </AdminDropdown>
  )
}
