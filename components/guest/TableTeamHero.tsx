'use client'

type Props = {
  tableName: string
  tableColor: string | null
  /** Table’s total points on the leaderboard */
  points: number
  /** 1-based rank, or null if unknown */
  rank: number | null
  totalTeams: number
}

export function TableTeamHero({
  tableName,
  tableColor,
  points,
  rank,
  totalTeams,
}: Props) {
  const accent = tableColor?.trim() || '#a78bfa'

  return (
    <section
      className="relative overflow-hidden rounded-3xl border bg-zinc-900/70 p-6 shadow-xl shadow-black/25 backdrop-blur-sm transition-transform duration-300 hover:shadow-2xl hover:shadow-black/30"
      style={{
        borderColor: `${accent}44`,
        boxShadow: `0 20px 40px -12px rgba(0,0,0,0.45), inset 0 1px 0 0 rgba(255,255,255,0.06)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-25 blur-3xl"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-8 left-4 h-24 w-24 rounded-full opacity-15 blur-2xl bg-amber-400/40"
        aria-hidden
      />

      <div className="relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
          Your table
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug text-white">
          You are on{' '}
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-base font-bold"
            style={{
              borderColor: `${accent}66`,
              backgroundColor: `${accent}18`,
              color: '#fff',
            }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full border border-white/20 shadow-sm"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            {tableName || 'Team'}
          </span>
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
              Points
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white">
              {Number.isFinite(points) ? points : 0}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
              Leaderboard
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white">
              {rank != null && totalTeams > 0 ? (
                <>
                  #{rank}
                  <span className="text-sm font-medium text-white/50">
                    {' '}
                    / {totalTeams}
                  </span>
                </>
              ) : (
                <span className="text-lg text-white/50">—</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
