'use client'

import { useEffect, useState } from 'react'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { rewardUnitMainIconUrl, type RewardUnitConfig } from '@/lib/reward-unit'

type DisplayVariant = 'default' | 'onDark'

/** Vector fallback with explicit fills so parent text color can't hide it. */
function RewardUnitVectorFallback({
  size,
  className,
}: {
  size: number
  className: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 align-middle ${className}`.trim()}
      aria-hidden
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="#a16207" />
      <circle cx="12" cy="12" r="6.75" fill="#f59e0b" />
    </svg>
  )
}

type Props = {
  /** Pixel size (width/height) */
  size?: number
  className?: string
  /** Visually hidden label for screen readers when icon is decorative */
  title?: string
  /** Kept for API compatibility; renderer intentionally ignores this. */
  displayVariant?: DisplayVariant
  /** Kept for API compatibility; renderer intentionally ignores this. */
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

  const showRaster = Boolean(url && !imgFailed)

  if (showRaster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dynamic admin-provided URL
      <img
        src={url!}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 object-contain align-middle ${className}`.trim()}
        title={title}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center align-middle leading-none ${className}`.trim()}
      style={{
        lineHeight: 1,
        minWidth: size,
        minHeight: size,
      }}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      <RewardUnitVectorFallback size={size} className="" />
    </span>
  )
}

/**
 * Configured reward icon (image URL) or vector fallback — uses global event config.
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
