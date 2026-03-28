'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type AdminDropdownProps = {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
  /** Classes for the trigger button (width, padding, border, etc.). */
  buttonClassName?: string
}

/**
 * Standard admin dropdown: trigger + anchored panel (click outside to close).
 * Use for compact selects; keep menu content as buttons/links.
 */
export function AdminDropdown({
  trigger,
  children,
  align = 'left',
  className = '',
  buttonClassName = 'flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-full border border-[#ebebeb] bg-white px-3 text-left text-[14px] font-medium text-[#171717] outline-none transition-colors hover:border-zinc-300',
}: AdminDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={`absolute top-[calc(100%+6px)] z-40 min-w-full overflow-hidden rounded-2xl border border-[#ebebeb] bg-white py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) setOpen(false)
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
