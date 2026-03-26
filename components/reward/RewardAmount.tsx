'use client'

import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { safeRewardPoints } from '@/lib/mission-ui'

type Props = {
  amount: number
  /** Show + prefix for rewards */
  showPlus?: boolean
  className?: string
  iconSize?: number
}

/** Numeric amount + reward icon (game economy display). */
export function RewardAmount({
  amount,
  showPlus = false,
  className = '',
  iconSize = 18,
}: Props) {
  const n = safeRewardPoints(amount)
  const text =
    showPlus && n > 0 ? `+${n}` : showPlus && n === 0 ? '0' : `${n}`
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <span>{text}</span>
      <RewardUnitIcon size={iconSize} />
    </span>
  )
}
