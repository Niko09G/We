import type { ReactNode } from 'react'

/** Missions routes inherit Montserrat from root layout. No overflow wrappers — sticky hero needs visible overflow on ancestors. */
export default function MissionsLayout({ children }: { children: ReactNode }) {
  return children
}
