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
      className="lobby-carousel-mask relative -mx-5 mt-8 w-[calc(100%+2.5rem)] overflow-hidden"
      aria-hidden
    >
      <div className="lobby-carousel-track flex w-max items-center gap-5 py-2">
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
                className="max-h-36 w-auto max-w-[min(42vw,11rem)] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.28)] sm:max-h-40 sm:max-w-[12rem]"
                draggable={false}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
