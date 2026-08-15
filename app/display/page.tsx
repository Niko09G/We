'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import {
  fetchNextFairGreetingForDisplay,
  recordGreetingDisplayed,
  type GreetingRow,
} from '@/lib/greetings-admin'
import { fetchLeaderboardBundle, type LeaderboardEntry, type RecentActivityItem } from '@/lib/leaderboard'
import { rewardUnitCompactLabel } from '@/lib/reward-unit'
import { supabase } from '@/lib/supabase/client'
import { resolveTeamPageConfig } from '@/lib/team-page-config'

const ROTATE_INTERVAL_MS = 10_000
const POLL_INTERVAL_MS = 30_000
const LEADERBOARD_POLL_MS = 20_000

/** Very subtle row tint from team hex (left accent is main signal). */
function teamColorTint(hex: string | null): string | null {
  if (!hex?.trim()) return null
  const h = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) return null
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},0.04)`
}

const MEDALS = ['🥇', '🥈', '🥉'] as const

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

function TeamAvatar({
  name,
  avatarUrl,
  tableColor,
}: {
  name: string
  avatarUrl: string | null
  tableColor: string | null
}) {
  const url = avatarUrl?.trim()
  return (
    <span className="inline-flex h-7 w-7 shrink-0 overflow-hidden rounded-full border border-zinc-700/80 bg-zinc-800">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-white"
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
  const { config: rewardUnit } = useRewardUnit()
  const [currentGreeting, setCurrentGreeting] = useState<GreetingRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [rowAnim, setRowAnim] = useState<
    Record<string, { delta?: number; rankUp?: boolean }>
  >({})
  const [recentEnterIds, setRecentEnterIds] = useState<Set<string>>(() => new Set())
  const [tableAvatars, setTableAvatars] = useState<Record<string, string>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  /** Row currently on the big screen; used to increment display_count on rotation. */
  const displayedGreetingRef = useRef<GreetingRow | null>(null)
  const prevLeaderboardRef = useRef<LeaderboardEntry[] | null>(null)
  const prevRecentIdsRef = useRef<string[]>([])
  const animClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchNextFairGreetingForDisplay(1)
        if (cancelled) return
        const next = rows[0] ?? null
        displayedGreetingRef.current = next
        setCurrentGreeting(next)
      } catch {
        if (!cancelled) {
          displayedGreetingRef.current = null
          setCurrentGreeting(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const ms = currentGreeting ? ROTATE_INTERVAL_MS : POLL_INTERVAL_MS
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const prevId = displayedGreetingRef.current?.id ?? null
      void (async () => {
        if (prevId) {
          try {
            await recordGreetingDisplayed(prevId)
          } catch {
            /* RPC or columns not migrated yet */
          }
        }
        try {
          const rows = await fetchNextFairGreetingForDisplay(1)
          const next = rows[0] ?? null
          displayedGreetingRef.current = next
          setCurrentGreeting(next)
        } catch {
          displayedGreetingRef.current = null
          setCurrentGreeting(null)
        }
      })()
    }, ms)
    return () => clearInterval(id)
  }, [currentGreeting])

  const fetchLeaderboardData = useCallback(async () => {
    try {
      const { leaderboard: next, recentActivity: recent } = await fetchLeaderboardBundle(3)
      const prev = prevLeaderboardRef.current
      const nextRowAnim: Record<string, { delta?: number; rankUp?: boolean }> = {}
      const nextRecentEnter = new Set<string>()

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
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void fetchLeaderboardData()
    }, LEADERBOARD_POLL_MS)
    return () => clearInterval(id)
  }, [fetchLeaderboardData])

  const leaderboardTableIdsKey = useMemo(() => {
    if (!leaderboard?.length) return ''
    return [...new Set(leaderboard.map((entry) => entry.tableId))].sort().join(',')
  }, [leaderboard])

  useEffect(() => {
    if (!leaderboardTableIdsKey) return
    let cancelled = false
    const ids = leaderboardTableIdsKey.split(',')
    void (async () => {
      const { data, error } = await supabase
        .from('tables')
        .select('id, name, color, page_config')
        .in('id', ids)
      if (cancelled || error || !data) return
      const next: Record<string, string> = {}
      for (const row of data) {
        const resolved = resolveTeamPageConfig(row.page_config, {
          tableColor: (row as { color?: string | null }).color ?? null,
          tableName: row.name as string,
        })
        const url = resolved.hero.avatarImage.url?.trim()
        if (url) next[row.id as string] = url
      }
      setTableAvatars(next)
    })()
    return () => {
      cancelled = true
    }
  }, [leaderboardTableIdsKey])

  useEffect(() => {
    return () => {
      if (animClearRef.current) clearTimeout(animClearRef.current)
      if (recentClearRef.current) clearTimeout(recentClearRef.current)
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const requestFullscreen = useCallback(() => {
    const el = containerRef.current ?? document.documentElement
    el.requestFullscreen?.()
  }, [])

  /** Strong left accent from team color; neutral when no color. */
  const rowLeftBorderStyle = (tableColor: string | null): { borderLeftColor: string } | undefined =>
    tableColor?.trim() && /^#?[0-9a-fA-F]{3,6}$/.test(tableColor.trim())
      ? { borderLeftColor: tableColor.trim().startsWith('#') ? tableColor.trim() : `#${tableColor.trim()}` }
      : undefined

  const rankCellClass = (rank: number) => {
    if (rank === 1) return 'font-mono text-base font-semibold text-amber-100'
    if (rank === 2) return 'font-mono text-base font-medium text-zinc-200'
    if (rank === 3) return 'font-mono text-base font-medium text-orange-100/90'
    return 'font-mono text-zinc-500'
  }

  const pointsCellClass = (rank: number) => {
    if (rank === 1) return 'text-xl font-bold tabular-nums text-white tracking-tight'
    if (rank <= 3) return 'text-lg font-bold tabular-nums text-zinc-50 tracking-tight'
    return 'text-sm font-semibold tabular-nums text-zinc-200'
  }

  const LeaderboardPanel = ({ showFullscreenButton = true }: { showFullscreenButton?: boolean }) => (
    <aside className="flex flex-1 min-w-0 flex-col min-h-0 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-lg font-semibold tracking-tight text-white">
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
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[3.25rem]" />
              <col />
              <col className="w-[5.5rem]" />
            </colgroup>
            <thead className="sticky top-0 z-[1] bg-zinc-900/95 backdrop-blur-sm">
              <tr className="border-b border-zinc-700/80 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="pb-3 pr-2 pl-1 font-mono">#</th>
                <th className="pb-3 pr-2">Team</th>
                <th className="pb-3 pl-1 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <RewardUnitIcon size={12} displayVariant="onDark" />
                    <span>{rewardUnitCompactLabel(rewardUnit)}</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => {
                const rank = index + 1
                const anim = rowAnim[entry.tableId]
                const glow = anim?.delta != null ? 'animate-[lbRowGlow_1.4s_ease-out]' : ''
                const rankLift = anim?.rankUp ? 'animate-[lbRankLift_1.15s_ease-out]' : ''
                const tint = teamColorTint(entry.tableColor)
                const leftBorderStyle = rowLeftBorderStyle(entry.tableColor)
                const rowStyle = {
                  ...(tint && { backgroundColor: tint }),
                  ...leftBorderStyle,
                }
                return (
                  <tr
                    key={entry.tableId}
                    style={Object.keys(rowStyle).length ? rowStyle : undefined}
                    className={`border-b border-zinc-800/80 border-l-4 pl-1 transition-[filter] duration-300 ${
                      leftBorderStyle ? '' : 'border-l-zinc-500/70'
                    } ${glow} ${rankLift}`}
                  >
                    <td className={`py-2.5 pr-2 pl-1 align-middle ${rankCellClass(rank)}`}>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        {rank <= 3 && (
                          <span
                            className={`select-none leading-none ${
                              rank === 1 ? 'text-2xl' : 'text-xl'
                            }`}
                            aria-hidden
                          >
                            {MEDALS[rank - 1]}
                          </span>
                        )}
                        <span>{rank}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 align-middle font-medium text-zinc-200 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <TeamAvatar
                          name={entry.tableName}
                          avatarUrl={tableAvatars[entry.tableId] ?? null}
                          tableColor={entry.tableColor}
                        />
                        <span className="min-w-0 break-words leading-snug">{entry.tableName}</span>
                      </span>
                    </td>
                    <td className={`py-2.5 pl-1 text-right align-middle ${pointsCellClass(rank)}`}>
                      <span className="inline-flex items-center justify-end gap-1">
                        <RewardUnitIcon size={13} displayVariant="onDark" />
                        <span className="tabular-nums">{entry.totalPoints}</span>
                        {anim?.delta != null && anim.delta > 0 && (
                          <span
                            className="text-[10px] font-medium text-amber-200/85 tabular-nums animate-[lbPointsPop_1.35s_ease-out]"
                            aria-hidden
                          >
                            +{anim.delta}
                          </span>
                        )}
                      </span>
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
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-300">
                    {item.tableName}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums font-semibold text-amber-200/90">
                    +{item.points}
                    <RewardUnitIcon size={11} displayVariant="onDark" />
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

  if (loading && !currentGreeting) {
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

  const hasGreetings = currentGreeting != null

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
              key={currentGreeting.id}
              className="absolute inset-0 animate-[fadeIn_0.8s_ease-out]"
            >
              <ImageWithFallback
                src={currentGreeting.image_url}
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
              <div
                key={currentGreeting.id}
                className="absolute inset-0 flex flex-col justify-end pb-[16%] px-[7%] animate-[greetingTextIn_0.55s_ease-out]"
              >
                <p className="max-w-2xl text-2xl font-medium leading-loose text-white whitespace-pre-wrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] md:text-3xl lg:text-4xl">
                  {currentGreeting.message}
                </p>
                {currentGreeting.source_type === 'mission' ? (
                  <div className="mt-4 inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-white/20"
                      style={{
                        backgroundColor: currentGreeting.table_color || '#71717a',
                      }}
                      aria-hidden
                    />
                    <p className="text-sm text-white/70 tracking-wide">
                      —{' '}
                      {currentGreeting.table_name?.trim() ||
                        currentGreeting.name?.trim() ||
                        'Table'}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-white/60 tracking-wide">
                    — {currentGreeting.name?.trim() || 'Anonymous'}
                  </p>
                )}
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
