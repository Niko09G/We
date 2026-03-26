'use client'

import { useEffect, useState } from 'react'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { rewardUnitMainIconUrl, type RewardUnitConfig } from '@/lib/reward-unit'

type DisplayVariant = 'default' | 'onDark'

function stripImageFilterUtilities(className: string): string {
  if (!className.trim()) return ''
  return className
    .split(/\s+/)
    .filter((token) => token !== 'brightness-0' && token !== 'invert')
    .join(' ')
}

/** Vector fallback — explicit fills so parent `color` / transparency cannot hide the coin. */
function RewardUnitVectorFallback({
  size,
  className,
  fill,
}: {
  size: number
  className: string
  fill: string
}) {
  const rim =
    fill.toLowerCase() === '#ffffff'
      ? '#e4e4e7'
      : fill.toLowerCase() === '#111111'
        ? '#3f3f46'
        : fill
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 align-middle ${className}`.trim()}
      aria-hidden
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill={rim} />
      <circle cx="12" cy="12" r="6.75" fill={fill} />
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
   * `onDark`: raster icons get an invert stack for light-on-dark UIs; vector fallback uses light fills.
   * Do not pass `brightness-0 invert` in className for rasters — use this instead.
   */
  displayVariant?: DisplayVariant
  /** When no image URL, overrides vector fallback fill (otherwise white on dark / near-black on light). */
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
  const safeClassName = stripImageFilterUtilities(className)
  const showRaster = Boolean(url && !imgFailed)

  if (showRaster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dynamic admin-provided URL
      <img
        src={url!}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 object-contain align-middle ${imgTone} ${safeClassName}`.trim()}
        title={title}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    )
  }

  const trimmedTint = tintColor?.trim()
  const vectorFill = trimmedTint || (onDark ? '#ffffff' : '#111111')

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center align-middle leading-none ${safeClassName}`.trim()}
      style={{
        lineHeight: 1,
        minWidth: size,
        minHeight: size,
      }}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      <RewardUnitVectorFallback size={size} className="" fill={vectorFill} />
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
