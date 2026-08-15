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
      className="absolute bottom-5 left-5 z-20 flex max-w-[min(58%,520px)] items-end gap-2 animate-[greetingTextIn_0.45s_ease-out]"
      aria-live="polite"
    >
      <div
        className="relative z-10 shrink-0 rounded-full border-2 border-white/90 p-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.28)]"
        style={{ background: gradientCss }}
        aria-hidden
      >
        <div className="h-11 w-11 overflow-hidden rounded-full bg-white/15">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
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
          className="absolute -left-1.5 bottom-4 h-3 w-3 rotate-45 bg-white shadow-sm"
          aria-hidden
        />
        <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.22)]">
          <p className="text-base font-medium leading-relaxed text-zinc-900 whitespace-pre-wrap md:text-lg">
            {greeting.message}
          </p>
          <p className="mt-1.5 text-xs font-semibold tracking-wide text-zinc-500">
            {isMission ? teamName : `— ${displayName}`}
          </p>
        </div>
      </div>
    </div>
  )
}
