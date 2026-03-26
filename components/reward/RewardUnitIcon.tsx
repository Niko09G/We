'use client'

import { useEffect, useState } from 'react'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { rewardUnitMainIconUrl, type RewardUnitConfig } from '@/lib/reward-unit'

type DisplayVariant = 'default' | 'onDark'

/** Vector fallback — uses `currentColor` so it works with any font stack (emoji alone often renders blank under Montserrat). */
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
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity={0.28} />
      <circle cx="12" cy="12" r="6.75" fill="currentColor" opacity={0.95} />
    </svg>
  )
}

type Props = {
  /** Pixel size (width/height) */
  size?: number
  className?: string
  /** Visually hidden label for screen readers when icon is decorative */
  title?: string
  /**
   * `onDark`: raster icons get an invert stack for light-on-dark UIs; vector fallback uses light `currentColor`.
   * Do not pass `brightness-0 invert` in className for rasters — use this instead.
   */
  displayVariant?: DisplayVariant
  /** When no image URL, tint the fallback glyph (e.g. team `page_config.theme.iconColor`). */
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
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    )
  }

  const fallbackColor = tintColor?.trim() || (onDark ? '#ffffff' : undefined)

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center align-middle leading-none ${!tintColor?.trim() && onDark ? 'text-white' : ''} ${className}`.trim()}
      style={{
        lineHeight: 1,
        minWidth: size,
        minHeight: size,
        ...(fallbackColor ? { color: fallbackColor } : {}),
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
