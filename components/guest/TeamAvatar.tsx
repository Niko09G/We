'use client'

function tableInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

function tableAvatarFallbackBg(seed: string): string {
  const colors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#ef4444', '#22c55e']
  let n = 0
  for (let i = 0; i < seed.length; i += 1) n += seed.charCodeAt(i)
  return colors[n % colors.length] ?? '#71717a'
}

export type TeamAvatarProps = {
  name: string
  /** Team avatar from page_config or guest emblems. */
  avatarUrl?: string | null
  tableColor?: string | null
  size?: 'sm' | 'md'
  className?: string
}

export function TeamAvatar({
  name,
  avatarUrl,
  tableColor = null,
  size = 'md',
  className = '',
}: TeamAvatarProps) {
  const url = avatarUrl?.trim()
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-[11px]'

  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-full border border-white/35 bg-white/20 ${dim} ${className}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center font-semibold text-white ${size === 'sm' ? 'text-[10px]' : 'text-[11px]'}`}
          style={{
            backgroundColor:
              tableColor?.trim() && /^#?[0-9a-fA-F]{3,6}$/.test(tableColor.trim())
                ? tableColor.trim().startsWith('#')
                  ? tableColor.trim()
                  : `#${tableColor.trim()}`
                : tableAvatarFallbackBg(name),
          }}
        >
          {tableInitials(name)}
        </span>
      )}
    </span>
  )
}
