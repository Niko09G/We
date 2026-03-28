'use client'

import type { ReactNode } from 'react'

/** Centered progress area with title left and close right — used by Table + Mission builder overlays. */
export function AdminBuilderShellHeader({
  title,
  center,
  closeLabel = 'Close editor',
  onClose,
}: {
  title: string
  center: ReactNode
  closeLabel?: string
  onClose: () => void
}) {
  return (
    <div className="relative flex min-h-[52px] items-center border-b border-zinc-200 px-5 py-3">
      <div className="relative z-10 min-w-0 max-w-[42%] shrink-0 pr-3">
        <h3 className="truncate text-lg font-semibold text-zinc-900">{title}</h3>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[min(42%,12rem)]">
        <div className="pointer-events-auto flex max-w-full justify-center">{center}</div>
      </div>
      <div className="relative z-10 ml-auto flex shrink-0 justify-end pl-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black text-white"
          aria-label={closeLabel}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export const BUILDER_PROGRESS_ACTIVE_CLASS =
  'bg-[linear-gradient(to_right,_#1ca0d8,_#5b38f2)]'

export const BUILDER_PROGRESS_INACTIVE_CLASS = 'bg-zinc-200'
