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
      className="absolute bottom-6 left-6 z-20 flex max-w-[min(72%,450px)] items-end gap-2.5 xl:bottom-12 xl:left-8 xl:max-w-[min(72%,900px)] xl:gap-5 2xl:bottom-[190px]"
      aria-live="polite"
    >
      <div
        className="relative z-10 shrink-0 animate-[greetingAvatarIn_0.4s_ease-out_both] rounded-full border-[1.5px] border-white/90 p-0.5 shadow-[0_3px_12px_rgba(0,0,0,0.32)] xl:border-[3px] xl:p-1 xl:shadow-[0_6px_24px_rgba(0,0,0,0.32)]"
        style={{ background: gradientCss }}
        aria-hidden
      >
        <div className="h-12 w-12 overflow-hidden rounded-full bg-white/15 xl:h-24 xl:w-24">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-base font-bold text-white xl:text-2xl"
              style={{
                backgroundColor: tableColor ?? fallbackAvatarBg(displayName),
              }}
            >
              {tableInitials(displayName)}
            </span>
          )}
        </div>
      </div>

      <div className="relative min-w-0 flex-1 animate-[greetingBubbleExpand_0.55s_cubic-bezier(0.22,1,0.36,1)_0.22s_both]">
        <div
          className="absolute -left-1.5 bottom-5 h-2.5 w-2.5 rotate-45 bg-white shadow-sm xl:-left-2.5 xl:bottom-10 xl:h-5 xl:w-5"
          aria-hidden
        />
        <div className="origin-bottom-left rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-[0_6px_24px_rgba(0,0,0,0.28)] xl:rounded-3xl xl:rounded-bl-lg xl:px-8 xl:py-6 xl:shadow-[0_12px_48px_rgba(0,0,0,0.28)]">
          <p className="text-sm font-bold leading-tight tracking-tight text-zinc-900 xl:text-xl 2xl:text-3xl">
            {isMission ? teamName : displayName}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-base font-medium leading-relaxed text-zinc-800 xl:mt-3 xl:text-3xl 2xl:text-4xl">
            {greeting.message}
          </p>
          {!isMission ? (
            <p className="mt-1.5 text-xs font-semibold tracking-wide text-zinc-500 xl:mt-3 xl:text-base">
              — {displayName}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
