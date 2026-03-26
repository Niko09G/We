'use client'

import { useEffect, useState } from 'react'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import {
  REWARD_UNIT_FALLBACK_EMOJI,
  rewardUnitMainIconUrl,
  type RewardUnitConfig,
} from '@/lib/reward-unit'

type DisplayVariant = 'default' | 'onDark'

type Props = {
  /** Pixel size (width/height) */
  size?: number
  className?: string
  /** Visually hidden label for screen readers when icon is decorative */
  title?: string
  /**
   * `onDark`: raster icons get an invert stack for light-on-dark UIs; emoji uses light tone.
   * Do not pass `brightness-0 invert` in className for rasters — use this instead.
   */
  displayVariant?: DisplayVariant
  /** When no image URL, tint the fallback emoji (e.g. team `page_config.theme.iconColor`). */
  tintColor?: string
}

/** Icon from explicit config (e.g. admin form preview before save). */
export function RewardUnitIconFromConfig({
  config,
  size = 18,
  className = '',
  title,
  displayVariant = 'default',
  tintColor,
}: Props & { config: RewardUnitConfig }) {
  const url = rewardUnitMainIconUrl(config)
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => {
    setImgFailed(false)
  }, [url])

  const onDark = displayVariant === 'onDark'
  const imgTone = onDark ? 'brightness-0 invert' : ''
  const showRaster = Boolean(url && !imgFailed)

  if (showRaster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dynamic admin-provided URL
      <img
        src={url!}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 object-contain align-middle ${imgTone} ${className}`.trim()}
        title={title}
        loading="lazy"
        decoding="async"
        onError={() => setImgFailed(true)}
      />
    )
  }

  const emojiColor = tintColor?.trim() || (onDark ? '#ffffff' : undefined)

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center align-middle leading-none ${!tintColor?.trim() && onDark ? 'text-white' : ''} ${className}`.trim()}
      style={{ fontSize: size, lineHeight: 1, ...(emojiColor ? { color: emojiColor } : {}) }}
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
export function RewardUnitIcon({
  size = 18,
  className = '',
  title,
  displayVariant = 'default',
  tintColor,
}: Props) {
  const { config } = useRewardUnit()
  return (
    <RewardUnitIconFromConfig
      config={config}
      size={size}
      className={className}
      title={title}
      displayVariant={displayVariant}
      tintColor={tintColor}
    />
  )
}
