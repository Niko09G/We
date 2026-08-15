'use client'

import type { GreetingRow } from '@/lib/greetings-admin'
import type { DisplayTeamVisual } from '@/lib/display-team-visuals'

function tableInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

function fallbackAvatarBg(seed: string): string {
  const colors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#ef4444', '#22c55e']
  let n = 0
  for (let i = 0; i < seed.length; i += 1) n += seed.charCodeAt(i)
  return colors[n % colors.length] ?? '#71717a'
}

export function GreetingSpeechBubble({
  greeting,
  teamVisual,
}: {
  greeting: GreetingRow
  teamVisual: DisplayTeamVisual | null
}) {
  const isMission = greeting.source_type === 'mission'
  const teamName =
    greeting.table_name?.trim() || greeting.name?.trim() || (isMission ? 'Table' : 'Guest')
  const displayName = isMission ? teamName : greeting.name?.trim() || 'Anonymous'

  const avatarUrl = isMission
    ? teamVisual?.avatarUrl ?? null
    : null
  const gradientCss =
    isMission && teamVisual
      ? teamVisual.heroGradientCss
      : `linear-gradient(145deg, #71717a, #3f3f46)`

  const tableColor =
    greeting.table_color?.trim() &&
    /^#?[0-9a-fA-F]{3,6}$/.test(greeting.table_color.trim())
      ? greeting.table_color.trim().startsWith('#')
        ? greeting.table_color.trim()
        : `#${greeting.table_color.trim()}`
      : null

  return (
    <div
      className="absolute bottom-10 left-8 z-20 flex max-w-[min(72%,900px)] items-end gap-5 animate-[greetingTextIn_0.45s_ease-out]"
      aria-live="polite"
    >
      <div
        className="relative z-10 shrink-0 rounded-full border-[3px] border-white/90 p-1 shadow-[0_6px_24px_rgba(0,0,0,0.32)]"
        style={{ background: gradientCss }}
        aria-hidden
      >
        <div className="h-24 w-24 overflow-hidden rounded-full bg-white/15">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-2xl font-bold text-white"
              style={{
                backgroundColor: tableColor ?? fallbackAvatarBg(displayName),
              }}
            >
              {tableInitials(displayName)}
            </span>
          )}
        </div>
      </div>

      <div className="relative min-w-0 flex-1">
        <div
          className="absolute -left-2.5 bottom-10 h-5 w-5 rotate-45 bg-white shadow-sm"
          aria-hidden
        />
        <div className="rounded-3xl rounded-bl-lg bg-white px-8 py-6 shadow-[0_12px_48px_rgba(0,0,0,0.28)]">
          <p className="text-2xl font-bold leading-tight tracking-tight text-zinc-900 md:text-3xl">
            {isMission ? teamName : displayName}
          </p>
          <p className="mt-3 text-xl font-medium italic leading-relaxed text-zinc-800 whitespace-pre-wrap md:text-2xl">
            {greeting.message}
          </p>
          {!isMission ? (
            <p className="mt-3 text-base font-semibold tracking-wide text-zinc-500">
              — {displayName}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
