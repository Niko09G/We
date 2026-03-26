'use client'

import type { ReactNode } from 'react'

export function AdminPageShell({
  title,
  intro,
  children,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="admin-page-shell">
      <header>
        <h1 className="admin-page-title text-zinc-900 dark:text-zinc-100">{title}</h1>
        {intro ? <p className="admin-gap-page-title-intro admin-intro">{intro}</p> : null}
      </header>
      <div className="admin-gap-intro-first-section space-y-6">{children}</div>
    </div>
  )
}

