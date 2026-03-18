'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { listReadyGreetingsForDisplay, type GreetingRow } from '@/lib/greetings-admin'
import { fetchLeaderboardBundle, type LeaderboardEntry, type RecentActivityItem } from '@/lib/leaderboard'

const ROTATE_INTERVAL_MS = 10_000
const POLL_INTERVAL_MS = 20_000
const LEADERBOARD_POLL_MS = 12_000

function ImageWithFallback({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div
        className={className}
        style={{ background: 'linear-gradient(135deg, #27272a 0%, #18181b 100%)' }}
        aria-hidden
      >
        <div className="flex h-full w-full items-center justify-center text-zinc-500 text-sm">
          Photo
        </div>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

export default function DisplayPage() {
  const [greetings, setGreetings] = useState<GreetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [rowAnim, setRowAnim] = useState<
    Record<string, { delta?: number; rankUp?: boolean }>
  >({})
  const [recentEnterIds, setRecentEnterIds] = useState<Set<string>>(() => new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const prevLeaderboardRef = useRef<LeaderboardEntry[] | null>(null)
  const prevRecentIdsRef = useRef<string[]>([])
  const animClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchGreetings = useCallback(async () => {
    try {
      const data = await listReadyGreetingsForDisplay()
      setGreetings(data)
      setCurrentIndex((i) => (data.length ? Math.min(i, data.length - 1) : 0))
    } catch {
      setGreetings((prev) => (prev.length ? prev : []))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      await fetchGreetings()
      if (cancelled) setLoading(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [fetchGreetings])

  useEffect(() => {
    const id = setInterval(fetchGreetings, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchGreetings])

  const fetchLeaderboardData = useCallback(async () => {
    try {
      const { leaderboard: next, recentActivity: recent } = await fetchLeaderboardBundle(3)
      const prev = prevLeaderboardRef.current
      const nextRowAnim: Record<string, { delta?: number; rankUp?: boolean }> = {}
      let nextRecentEnter = new Set<string>()

      if (prev && prev.length > 0 && next.length > 0) {
        const oldRank = new Map(prev.map((e, i) => [e.tableId, i]))
        const oldPts = new Map(prev.map((e) => [e.tableId, e.totalPoints]))
        next.forEach((e, newIdx) => {
          const or = oldRank.get(e.tableId)
          const op = oldPts.get(e.tableId)
          if (or === undefined || op === undefined) return
          const delta = e.totalPoints > op ? e.totalPoints - op : undefined
          const rankUp = newIdx < or
          if (delta !== undefined || rankUp) {
            nextRowAnim[e.tableId] = { delta, rankUp: rankUp || undefined }
          }
        })
      }

      const prevRecent = prevRecentIdsRef.current
      if (prevRecent.length > 0) {
        recent.forEach((r) => {
          if (!prevRecent.includes(r.id)) nextRecentEnter.add(r.id)
        })
      }
      prevRecentIdsRef.current = recent.map((r) => r.id)
      prevLeaderboardRef.current = next

      if (animClearRef.current) clearTimeout(animClearRef.current)
      if (recentClearRef.current) clearTimeout(recentClearRef.current)

      setRowAnim(nextRowAnim)
      setRecentEnterIds(nextRecentEnter)
      setLeaderboard(next)
      setRecentActivity(recent)
      setLeaderboardError(null)

      if (Object.keys(nextRowAnim).length > 0) {
        animClearRef.current = setTimeout(() => setRowAnim({}), 1600)
      }
      if (nextRecentEnter.size > 0) {
        recentClearRef.current = setTimeout(() => setRecentEnterIds(new Set()), 700)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load leaderboard'
      setLeaderboardError(msg)
      setLeaderboard((prev) => prev)
      setRecentActivity((prev) => prev)
    } finally {
      setLeaderboardLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      await fetchLeaderboardData()
      if (cancelled) setLeaderboardLoading(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [fetchLeaderboardData])

  useEffect(() => {
    const id = setInterval(fetchLeaderboardData, LEADERBOARD_POLL_MS)
    return () => clearInterval(id)
  }, [fetchLeaderboardData])

  useEffect(() => {
    return () => {
      if (animClearRef.current) clearTimeout(animClearRef.current)
      if (recentClearRef.current) clearTimeout(recentClearRef.current)
    }
  }, [])

  useEffect(() => {
    if (greetings.length <= 1) return
    const id = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % greetings.length)
    }, ROTATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [greetings.length])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const requestFullscreen = useCallback(() => {
    const el = containerRef.current ?? document.documentElement
    el.requestFullscreen?.()
  }, [])

  const rankRowClass = (rank: number) => {
    if (rank === 1)
      return 'border-l-2 border-l-amber-500/60 bg-gradient-to-r from-amber-950/35 to-transparent'
    if (rank === 2)
      return 'border-l-2 border-l-zinc-400/50 bg-gradient-to-r from-zinc-800/40 to-transparent'
    if (rank === 3)
      return 'border-l-2 border-l-orange-900/50 bg-gradient-to-r from-orange-950/25 to-transparent'
    return ''
  }

  const rankCellClass = (rank: number) => {
    if (rank === 1) return 'font-mono text-base font-semibold text-amber-200/95'
    if (rank === 2) return 'font-mono text-base font-medium text-zinc-300'
    if (rank === 3) return 'font-mono text-base font-medium text-orange-200/80'
    return 'font-mono text-zinc-600'
  }

  const pointsCellClass = (rank: number) => {
    if (rank <= 3) return 'text-xl font-bold tabular-nums text-white tracking-tight'
    return 'text-base font-semibold tabular-nums text-zinc-200'
  }

  const LeaderboardPanel = ({ showFullscreenButton = true }: { showFullscreenButton?: boolean }) => (
    <aside className="flex flex-1 min-w-0 flex-col min-h-0 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Leaderboard
        </h2>
        {showFullscreenButton && !isFullscreen && (
          <button
            type="button"
            onClick={requestFullscreen}
            className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-300 transition-opacity duration-300"
            aria-label="Enter fullscreen"
          >
            Fullscreen
          </button>
        )}
      </div>
      {leaderboardError && leaderboard && leaderboard.length > 0 && (
        <p className="mt-2 text-[10px] text-amber-600/90 dark:text-amber-500/80" role="status">
          Live update paused — showing last scores
        </p>
      )}
      <div className="mt-4 flex-1 min-h-0 overflow-y-auto">
        {leaderboardLoading && leaderboard === null && (
          <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
        )}
        {leaderboardError && leaderboard === null && (
          <p className="py-6 text-center text-sm text-red-400" role="alert">
            {leaderboardError}
          </p>
        )}
        {!leaderboardLoading && !leaderboardError && leaderboard && leaderboard.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">No completions yet</p>
        )}
        {leaderboard && leaderboard.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-zinc-900/95 backdrop-blur-sm">
              <tr className="border-b border-zinc-700/80 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="pb-3 pr-2 pl-1 font-mono">#</th>
                <th className="pb-3 pr-2">Table</th>
                <th className="pb-3 pr-2">Pts</th>
                <th className="pb-3">Completed</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => {
                const rank = index + 1
                const totalMissions = entry.completedCount + entry.remainingCount
                const anim = rowAnim[entry.tableId]
                const glow = anim?.delta != null ? 'animate-[lbRowGlow_1.4s_ease-out]' : ''
                const rankLift = anim?.rankUp ? 'animate-[lbRankLift_1.15s_ease-out]' : ''
                return (
                  <tr
                    key={entry.tableId}
                    className={`border-b border-zinc-800/80 pl-1 transition-[filter] duration-300 ${rankRowClass(rank)} ${glow} ${rankLift}`}
                  >
                    <td className={`py-3 pr-2 pl-1 ${rankCellClass(rank)}`}>{rank}</td>
                    <td className="py-3 pr-2 font-medium text-zinc-200 truncate max-w-[72px] text-sm">
                      {entry.tableName}
                    </td>
                    <td className={`py-3 pr-2 ${pointsCellClass(rank)}`}>
                      <span className="inline-flex items-baseline gap-1">
                        <span>{entry.totalPoints}</span>
                        {anim?.delta != null && anim.delta > 0 && (
                          <span
                            className="text-[11px] font-medium text-amber-200/85 tabular-nums animate-[lbPointsPop_1.35s_ease-out]"
                            aria-hidden
                          >
                            +{anim.delta}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 pr-1">
                      <span className="text-[10px] text-zinc-500">Completed: </span>
                      <span className="text-sm font-semibold tabular-nums text-zinc-100">
                        {entry.completedCount}
                      </span>
                      <span className="text-xs text-zinc-500"> / </span>
                      <span className="text-xs tabular-nums text-zinc-500">{totalMissions}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4 shrink-0 border-t border-zinc-800 pt-4">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Recent activity
        </h3>
        {recentActivity.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-600">No recent completions</p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {recentActivity.map((item) => (
              <li
                key={item.id}
                className={`border-b border-zinc-800/60 pb-2 last:border-0 last:pb-0 text-xs leading-snug ${
                  recentEnterIds.has(item.id)
                    ? 'animate-[recentSlideIn_0.5s_ease-out]'
                    : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-zinc-300">{item.tableName}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-amber-200/90">
                    +{item.points}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-zinc-500">{item.missionTitle}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )

  if (loading && greetings.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex h-screen w-screen items-stretch gap-6 bg-zinc-950 p-6"
      >
        <div className="flex flex-[3] min-w-0 items-center justify-center rounded-2xl bg-zinc-900/50">
          <span className="text-zinc-500">Loading…</span>
        </div>
        <LeaderboardPanel showFullscreenButton={false} />
      </div>
    )
  }

  const hasGreetings = greetings.length > 0

  return (
    <div
      ref={containerRef}
      className="flex h-screen w-screen items-stretch gap-6 bg-zinc-950 p-6"
    >
      {/* Left panel: greeting carousel (~3/4) */}
      <div className="relative flex-[3] min-w-0 overflow-hidden rounded-2xl bg-zinc-900">
        {!hasGreetings ? (
          <div className="flex h-full w-full flex-col items-center justify-center px-8">
            <div className="mb-6 h-px w-16 bg-zinc-600" />
            <p className="text-xl font-medium text-zinc-400 tracking-wide">
              Greetings will appear here
            </p>
            <p className="mt-3 text-center text-sm text-zinc-500">
              Share the upload link with guests to see their messages on this screen.
            </p>
          </div>
        ) : (
          <>
            <div
              key={currentIndex}
              className="absolute inset-0 animate-[fadeIn_0.8s_ease-out]"
            >
              <ImageWithFallback
                src={greetings[currentIndex].image_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
              {/* Gradient: lower ~45% of image for readable text, no harsh edge */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.78) 20%, rgba(0,0,0,0.45) 45%, transparent 100%)',
                }}
              />
              <div className="absolute inset-0 flex flex-col justify-end pb-[16%] px-[7%]">
                <p className="max-w-2xl text-2xl font-medium leading-loose text-white whitespace-pre-wrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] md:text-3xl lg:text-4xl">
                  {greetings[currentIndex].message}
                </p>
                <p className="mt-4 text-sm text-white/60 tracking-wide">
                  — {greetings[currentIndex].name?.trim() || 'Anonymous'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right panel: leaderboard placeholder (~1/4) */}
      <LeaderboardPanel />
    </div>
  )
}
