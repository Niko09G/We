'use client'

import type { ReactNode } from 'react'
import { RewardUnitProvider } from '@/components/reward/RewardUnitProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return <RewardUnitProvider>{children}</RewardUnitProvider>
}
