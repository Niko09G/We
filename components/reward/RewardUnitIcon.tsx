'use client'

import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import {
  REWARD_UNIT_FALLBACK_EMOJI,
  rewardUnitMainIconUrl,
  type RewardUnitConfig,
} from '@/lib/reward-unit'

type Props = {
  /** Pixel size (width/height) */
  size?: number
  className?: string
  /** Visually hidden label for screen readers when icon is decorative */
  title?: string
}

/** Icon from explicit config (e.g. admin form preview before save). */
export function RewardUnitIconFromConfig({
  config,
  size = 18,
  className = '',
  title,
}: Props & { config: RewardUnitConfig }) {
  const url = rewardUnitMainIconUrl(config)

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dynamic admin-provided URL
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 object-contain align-middle ${className}`}
        title={title}
        loading="lazy"
      />
    )
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center align-middle leading-none ${className}`}
      style={{ fontSize: size }}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {REWARD_UNIT_FALLBACK_EMOJI}
    </span>
  )
}

/**
 * Configured reward icon (image URL) or fallback emoji — uses global event config.
 */
export function RewardUnitIcon({ size = 18, className = '', title }: Props) {
  const { config } = useRewardUnit()
  return (
    <RewardUnitIconFromConfig config={config} size={size} className={className} title={title} />
  )
}
