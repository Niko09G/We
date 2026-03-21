'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  emoji: string
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  className?: string
  children?: ReactNode
}

export function GuestBigAction({
  title,
  subtitle,
  emoji,
  href,
  onClick,
  variant = 'secondary',
  className = '',
  children,
}: Props) {
  const base =
    'group flex w-full items-stretch gap-4 rounded-3xl border p-5 text-left shadow-lg transition duration-200 active:scale-[0.99] motion-safe:hover:scale-[1.01] motion-safe:hover:shadow-xl'
  const styles =
    variant === 'primary'
      ? 'border-violet-400/30 bg-gradient-to-br from-violet-600/90 to-fuchsia-600/80 text-white shadow-violet-950/40 motion-safe:hover:shadow-violet-900/50'
      : 'border-white/10 bg-zinc-800/80 text-white shadow-black/30 motion-safe:hover:border-white/20 motion-safe:hover:bg-zinc-800'

  const inner = (
    <>
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-inner ${
          variant === 'primary'
            ? 'bg-white/20 ring-1 ring-white/30'
            : 'bg-white/10 ring-1 ring-white/10'
        }`}
        aria-hidden
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-base font-bold tracking-tight">{title}</p>
        {subtitle ? (
          <p
            className={`mt-1 text-xs leading-relaxed ${
              variant === 'primary' ? 'text-white/85' : 'text-white/65'
            }`}
          >
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </>
  )

  const combined = `${base} ${styles} ${className}`

  if (href) {
    return (
      <Link href={href} className={combined}>
        {inner}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={combined}>
      {inner}
    </button>
  )
}
