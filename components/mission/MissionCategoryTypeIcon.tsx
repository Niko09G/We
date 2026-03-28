'use client'

import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import type { MissionValidationType } from '@/lib/mission-validation-type'

const RASTER_SRC: Record<Exclude<MissionValidationType, 'beatcoin'>, string> = {
  photo: '/mission-category/PhotoC.svg',
  video: '/mission-category/VideoC.svg',
  signature: '/mission-category/SignatureC.svg',
  text: '/mission-category/ResponseC.svg',
}

const RASTER_WHITE_SRC: Record<Exclude<MissionValidationType, 'beatcoin'>, string> = {
  photo: '/mission-category/PhotoW.svg',
  video: '/mission-category/VideoW.svg',
  signature: '/mission-category/SignatureW.svg',
  text: '/mission-category/ResponseW.svg',
}

export type MissionCategoryTypeIconProps = {
  /** DB / form value: photo | video | signature | text | beatcoin */
  type: string
  /** Pixel size (width/height) for raster icons; passed to RewardUnitIcon for beatcoin */
  size?: number
  className?: string
  /** Use white glyph on gradient / dark (CSS invert on raster assets) */
  onGradient?: boolean
  /** Colored category art vs white SVGs (non-beatcoin). Beatcoin always uses event currency image. */
  rasterVariant?: 'color' | 'white'
  /** RewardUnitIcon display variant when type is beatcoin */
  beatcoinDisplayVariant?: 'default' | 'onDark'
}

/**
 * Shared mission category visuals: raster SVGs per type, event currency image for beatcoin.
 * Used in admin and guest UIs — keep paths in sync with `/public/mission-category/*`.
 */
export function MissionCategoryTypeIcon({
  type,
  size = 20,
  className = '',
  onGradient = false,
  rasterVariant = 'color',
  beatcoinDisplayVariant = 'default',
}: MissionCategoryTypeIconProps) {
  const t = String(type ?? '').toLowerCase() as MissionValidationType | string
  if (t === 'beatcoin') {
    return (
      <RewardUnitIcon
        size={size}
        className={className}
        displayVariant={beatcoinDisplayVariant}
        aria-hidden
      />
    )
  }
  if (t === 'photo' || t === 'video' || t === 'signature' || t === 'text') {
    const src = rasterVariant === 'white' ? RASTER_WHITE_SRC[t] : RASTER_SRC[t]
    const useInvert = onGradient && rasterVariant === 'color'
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static category art from /public
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`object-contain ${useInvert ? 'brightness-0 invert' : ''} ${className}`.trim()}
        aria-hidden
      />
    )
  }
  return (
    <span className={`inline-block text-[0.65em] leading-none ${className}`.trim()} aria-hidden>
      •
    </span>
  )
}
