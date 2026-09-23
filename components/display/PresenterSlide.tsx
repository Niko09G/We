'use client'

import { useState } from 'react'

import type { DisplaySlideRow } from '@/lib/display-slides'

function PresenterAvatar({
  imageUrl,
  name,
  sizeClass,
}: {
  imageUrl: string
  name: string
  sizeClass: string
}) {
  const [failed, setFailed] = useState(false)
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border-4 border-white/15 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] ${sizeClass}`}
    >
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={name.trim() || 'Presenter'}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/10 text-4xl font-semibold text-white/70 md:text-5xl">
          {initial}
        </div>
      )}
    </div>
  )
}

export function PresenterSlide({ slide }: { slide: DisplaySlideRow }) {
  const speakers = slide.speakers.filter((s) => s.name.trim() || s.image_url.trim())
  const isSingle = speakers.length <= 1
  const eyebrow = slide.eyebrow.trim()
  const title = slide.title.trim()

  return (
    <div
      key={slide.id}
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden px-8 py-10 motion-safe:animate-[presenterSlideIn_0.65s_ease-out]"
      style={{ backgroundColor: slide.bg_color }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at 50% 40%, rgba(255,255,255,0.08) 0%, transparent 65%)',
        }}
        aria-hidden
      />

      {isSingle ? (
        <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
          {eyebrow ? (
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-white/55">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h1 className="mb-10 max-w-4xl text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
              {title}
            </h1>
          ) : null}
          {speakers[0] ? (
            <>
              <PresenterAvatar
                imageUrl={speakers[0].image_url}
                name={speakers[0].name}
                sizeClass="h-52 w-52 sm:h-60 sm:w-60 md:h-72 md:w-72"
              />
              {speakers[0].name.trim() ? (
                <p className="mt-8 text-2xl font-medium tracking-wide text-white/90 sm:text-3xl">
                  {speakers[0].name.trim()}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <div className="relative z-10 flex w-full max-w-6xl flex-col items-center text-center">
          {eyebrow ? (
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-white/55">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h1 className="mb-12 max-w-5xl text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
              {title}
            </h1>
          ) : null}
          <div className="flex w-full flex-wrap items-start justify-center gap-8 sm:gap-10 md:gap-14">
            {speakers.map((speaker, index) => (
              <div
                key={`${speaker.name}-${index}`}
                className="flex min-w-[9rem] max-w-[14rem] flex-col items-center sm:min-w-[10rem] sm:max-w-[16rem]"
              >
                <PresenterAvatar
                  imageUrl={speaker.image_url}
                  name={speaker.name}
                  sizeClass="h-36 w-36 sm:h-44 sm:w-44 md:h-52 md:w-52"
                />
                {speaker.name.trim() ? (
                  <p className="mt-5 text-lg font-medium tracking-wide text-white/90 sm:text-xl md:text-2xl">
                    {speaker.name.trim()}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
