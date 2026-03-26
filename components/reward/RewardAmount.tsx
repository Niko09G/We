'use client'

import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { safeRewardPoints } from '@/lib/mission-ui'

type Props = {
  amount: number
  /** Show + prefix for rewards */
  showPlus?: boolean
  className?: string
  iconSize?: number
  /** Light icon on dark backgrounds; default on light backgrounds. */
  displayVariant?: 'default' | 'onDark'
}

/** Numeric amount + reward icon (game economy display). */
export function RewardAmount({
  amount,
  showPlus = false,
  className = '',
  iconSize = 18,
  displayVariant = 'default',
}: Props) {
  const n = safeRewardPoints(amount)
  const text =
    showPlus && n > 0 ? `+${n}` : showPlus && n === 0 ? '0' : `${n}`
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <span>{text}</span>
      <RewardUnitIcon size={iconSize} displayVariant={displayVariant} />
    </span>
  )
}
