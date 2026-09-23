'use client'

import { useEffect, useState } from 'react'

import { fetchLobbySettings } from '@/lib/lobby-settings'

export function SpeechOverlay() {
  const [monogram, setMonogram] = useState('N & B')
  const [title, setTitle] = useState('Nikobea')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const settings = await fetchLobbySettings()
        if (cancelled) return
        const heroTitle = settings.hero.title.trim()
        if (heroTitle) setTitle(heroTitle)
        if (settings.header_logo_url) setLogoUrl(settings.header_logo_url)
        const initials = heroTitle
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? '')
          .join(' & ')
        if (initials.replace(/\s/g, '').length >= 2) setMonogram(initials)
      } catch {
        /* keep defaults */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#070708]">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(120,90,180,0.18) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 20% 80%, rgba(60,120,180,0.12) 0%, transparent 50%), radial-gradient(ellipse 50% 40% at 80% 70%, rgba(180,120,80,0.1) 0%, transparent 45%)',
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,transparent_35%,rgba(0,0,0,0.35)_100%)]" aria-hidden />

      <div className="relative z-10 flex flex-col items-center px-10 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="mb-10 max-h-32 w-auto max-w-[min(420px,70vw)] object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          />
        ) : (
          <div
            className="mb-10 flex h-28 w-28 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-3xl font-light tracking-[0.2em] text-white/90 shadow-[0_0_80px_rgba(255,255,255,0.06)]"
            aria-hidden
          >
            {monogram}
          </div>
        )}

        <h1 className="max-w-3xl text-4xl font-light tracking-[0.12em] text-white/95 sm:text-5xl">
          {title}
        </h1>
        <div className="mt-8 h-px w-16 bg-white/20" aria-hidden />
        <p className="mt-6 max-w-md text-base font-light tracking-wide text-zinc-400/90">
          Presentation in progress
        </p>
      </div>
    </div>
  )
}
