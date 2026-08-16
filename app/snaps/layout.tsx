import type { ReactNode } from 'react'

export default function SnapsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-slate-900 antialiased">
      {children}
    </div>
  )
}
