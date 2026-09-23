'use client'

export function AnnouncementOverlay({ text }: { text: string }) {
  const displayText = text.trim() || 'Announcement'

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-zinc-950 px-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 45%, rgba(28,160,216,0.14) 0%, transparent 60%), radial-gradient(ellipse 55% 45% at 75% 75%, rgba(91,56,242,0.12) 0%, transparent 55%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-5xl text-center">
        <p className="mb-6 text-sm font-semibold uppercase tracking-[0.35em] text-zinc-500">
          Announcement
        </p>
        <p className="text-balance text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
          {displayText}
        </p>
      </div>
    </div>
  )
}
