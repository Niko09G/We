'use client'

type CarouselStyle = {
  translateY: string
  rotate: string
  scale: string
  opacity: string
  zIndex: string
}

const ORGANIC_STYLES: CarouselStyle[] = [
  { translateY: '-translate-y-3', rotate: 'rotate-2', scale: 'scale-105', opacity: 'opacity-100', zIndex: 'z-20' },
  { translateY: 'translate-y-4', rotate: '-rotate-1', scale: 'scale-100', opacity: 'opacity-80', zIndex: 'z-10' },
  { translateY: '-translate-y-1', rotate: 'rotate-3', scale: 'scale-[1.08]', opacity: 'opacity-100', zIndex: 'z-30' },
  { translateY: 'translate-y-2', rotate: '-rotate-2', scale: 'scale-95', opacity: 'opacity-80', zIndex: 'z-0' },
  { translateY: '-translate-y-4', rotate: 'rotate-1', scale: 'scale-100', opacity: 'opacity-100', zIndex: 'z-20' },
  { translateY: 'translate-y-1', rotate: '-rotate-3', scale: 'scale-105', opacity: 'opacity-80', zIndex: 'z-10' },
  { translateY: '-translate-y-2', rotate: 'rotate-2', scale: 'scale-[1.02]', opacity: 'opacity-100', zIndex: 'z-30' },
  { translateY: 'translate-y-3', rotate: '-rotate-1', scale: 'scale-100', opacity: 'opacity-80', zIndex: 'z-0' },
  { translateY: '-translate-y-1', rotate: 'rotate-3', scale: 'scale-110', opacity: 'opacity-100', zIndex: 'z-20' },
  { translateY: 'translate-y-2', rotate: '-rotate-2', scale: 'scale-95', opacity: 'opacity-80', zIndex: 'z-10' },
]

function styleForIndex(index: number): CarouselStyle {
  return ORGANIC_STYLES[index % ORGANIC_STYLES.length]!
}

type LobbyImageCarouselProps = {
  images: string[]
}

export function LobbyImageCarousel({ images }: LobbyImageCarouselProps) {
  const urls = images.map((u) => u.trim()).filter(Boolean)
  if (urls.length === 0) return null

  const track = [...urls, ...urls]

  return (
    <div
      className="relative -mx-5 mt-auto w-[calc(100%+2.5rem)] min-h-[176px] overflow-hidden"
      aria-hidden
    >
      <div className="lobby-carousel-track flex w-max items-end gap-5 pb-0 pt-2">
        {track.map((url, index) => {
          const style = styleForIndex(index)
          return (
            <div
              key={`${url}-${index}`}
              className={`relative shrink-0 ${style.translateY} ${style.rotate} ${style.scale} ${style.opacity} ${style.zIndex}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="max-h-[158px] w-auto max-w-[min(42vw,11rem)] object-contain sm:max-h-[176px] sm:max-w-[12rem]"
                draggable={false}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
