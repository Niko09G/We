'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BeatCoinFlyLayer, type FlyingBeatCoin } from '@/components/display/BeatCoinFly'
import { DisplayConfetti } from '@/components/display/DisplayConfetti'
import { GreetingSpeechBubble } from '@/components/display/GreetingSpeechBubble'
import { LeaderboardSidebar } from '@/components/display/LeaderboardSidebar'
import { MomentumFeed, useMomentumFeed } from '@/components/display/MomentumFeed'
import {
  fetchDisplayTeamVisuals,
  type DisplayTeamVisual,
} from '@/lib/display-team-visuals'
import {
  fetchDisplayGreetings,
  recordGreetingDisplayed,
  type GreetingRow,
} from '@/lib/greetings-admin'
import {
  fetchGuestEmblemsConfig,
  type GuestEmblemsSettingsValue,
} from '@/lib/guest-emblem-config'
import type { LeaderboardEntry, RecentActivityItem } from '@/lib/leaderboard'
import { supabase } from '@/lib/supabase/client'

const DISPLAY_GRID_CLASS = 'grid h-screen w-screen grid-cols-[8.6fr_3.4fr] gap-6 bg-zinc-950 p-6'

const GREETING_ROTATE_MS = 10_000
const LIVE_POLL_MS = 25_000
const RECENT_FETCH_LIMIT = 8

function sortGreetingsNewestFirst(rows: GreetingRow[]): GreetingRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

function greetingFromRealtimeRow(row: Record<string, unknown>): GreetingRow | null {
  const id = typeof row.id === 'string' ? row.id : null
  const image_url = typeof row.image_url === 'string' ? row.image_url.trim() : ''
  const status = typeof row.status === 'string' ? row.status : null
  const created_at = typeof row.created_at === 'string' ? row.created_at : null
  if (!id || !image_url || !status || !created_at) return null
  if (status !== 'ready') return null

  const messageRaw = typeof row.message === 'string' ? row.message.trim() : ''
  const message = messageRaw.length > 0 ? messageRaw : 'Greeting'

  return {
    id,
    message,
    image_url,
    status,
    created_at,
    name: typeof row.name === 'string' ? row.name : null,
    source_type:
      row.source_type === 'mission' || row.source_type === 'upload'
        ? row.source_type
        : undefined,
    table_id: typeof row.table_id === 'string' ? row.table_id : null,
    table_name: typeof row.table_name === 'string' ? row.table_name : null,
    table_color: typeof row.table_color === 'string' ? row.table_color : null,
  }
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
        <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
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

async function fetchLiveBundle(): Promise<{
  leaderboard: LeaderboardEntry[]
  recentActivity: RecentActivityItem[]
}> {
  const res = await fetch(`/api/display/live?recent=${RECENT_FETCH_LIMIT}`, {
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Failed to load live display data')
  }
  return res.json() as Promise<{
    leaderboard: LeaderboardEntry[]
    recentActivity: RecentActivityItem[]
  }>
}

export default function DisplayPage() {
  const [greetings, setGreetings] = useState<GreetingRow[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [greetingLoading, setGreetingLoading] = useState(true)
  const [rotationEpoch, setRotationEpoch] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [rowAnim, setRowAnim] = useState<Record<string, { delta?: number }>>({})
  const [teamVisuals, setTeamVisuals] = useState<Record<string, DisplayTeamVisual>>({})
  const [teamAvatars, setTeamAvatars] = useState<Record<string, string>>({})
  const [confettiFire, setConfettiFire] = useState(0)
  const [flyingCoins, setFlyingCoins] = useState<FlyingBeatCoin[]>([])
  const [rankEmblems, setRankEmblems] = useState<GuestEmblemsSettingsValue>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const mainCanvasRef = useRef<HTMLDivElement>(null)
  const greetingsRef = useRef<GreetingRow[]>([])
  const currentIndexRef = useRef(0)
  const rotateIntervalRef = useRef<number | ReturnType<typeof setInterval> | null>(null)
  const prevLeaderboardRef = useRef<LeaderboardEntry[] | null>(null)
  const teamCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const animClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const feedItems = useMomentumFeed(recentActivity)

  const currentGreeting = useMemo(() => {
    if (greetings.length === 0) return null
    const idx = ((currentIndex % greetings.length) + greetings.length) % greetings.length
    return greetings[idx] ?? null
  }, [greetings, currentIndex])

  const greetingTeamVisual = useMemo(() => {
    if (!currentGreeting?.table_id) return null
    return teamVisuals[currentGreeting.table_id] ?? null
  }, [currentGreeting, teamVisuals])

  const bumpRotationTimer = useCallback(() => {
    setRotationEpoch((n) => n + 1)
  }, [])

  const queueNewGreeting = useCallback(
    (row: GreetingRow) => {
      if (row.status !== 'ready') return

      setGreetings((prev) => {
        const withoutDup = prev.filter((g) => g.id !== row.id)
        const next = sortGreetingsNewestFirst([row, ...withoutDup])
        greetingsRef.current = next
        return next
      })
      currentIndexRef.current = 0
      setCurrentIndex(0)
      bumpRotationTimer()
    },
    [bumpRotationTimer]
  )

  const loadGreetings = useCallback(async () => {
    try {
      const rows = sortGreetingsNewestFirst(await fetchDisplayGreetings())
      greetingsRef.current = rows
      setGreetings(rows)
      currentIndexRef.current = 0
      setCurrentIndex(0)
      bumpRotationTimer()
    } catch {
      greetingsRef.current = []
      setGreetings([])
      currentIndexRef.current = 0
      setCurrentIndex(0)
    } finally {
      setGreetingLoading(false)
    }
  }, [bumpRotationTimer])

  useEffect(() => {
    void loadGreetings()
  }, [loadGreetings])

  useEffect(() => {
    greetingsRef.current = greetings
  }, [greetings])

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    if (rotateIntervalRef.current) {
      clearInterval(rotateIntervalRef.current)
      rotateIntervalRef.current = null
    }

    if (greetings.length === 0) return

    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

      const list = greetingsRef.current
      if (list.length <= 1) return

      const prevIdx =
        ((currentIndexRef.current % list.length) + list.length) % list.length
      const prevGreeting = list[prevIdx]
      if (prevGreeting) {
        void recordGreetingDisplayed(prevGreeting.id).catch(() => {
          /* RPC or columns not migrated yet */
        })
      }

      const nextIdx = (prevIdx + 1) % list.length
      currentIndexRef.current = nextIdx
      setCurrentIndex(nextIdx)
    }, GREETING_ROTATE_MS)

    rotateIntervalRef.current = id

    return () => {
      clearInterval(id)
      if (rotateIntervalRef.current === id) rotateIntervalRef.current = null
    }
  }, [greetings.length, rotationEpoch])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cfg = await fetchGuestEmblemsConfig()
        if (!cancelled) setRankEmblems(cfg)
      } catch {
        if (!cancelled) setRankEmblems({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('display-greetings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'greetings' },
        (payload) => {
          const row = greetingFromRealtimeRow(
            payload.new as Record<string, unknown>
          )
          if (row) queueNewGreeting(row)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'greetings' },
        (payload) => {
          const row = greetingFromRealtimeRow(
            payload.new as Record<string, unknown>
          )
          if (row) {
            queueNewGreeting(row)
            return
          }

          const updatedId =
            typeof (payload.new as { id?: unknown }).id === 'string'
              ? (payload.new as { id: string }).id
              : null
          const newStatus =
            typeof (payload.new as { status?: unknown }).status === 'string'
              ? (payload.new as { status: string }).status
              : null
          if (!updatedId || newStatus === 'ready') return

          setGreetings((prev) => {
            const removeIdx = prev.findIndex((g) => g.id === updatedId)
            if (removeIdx === -1) return prev

            const next = prev.filter((g) => g.id !== updatedId)
            greetingsRef.current = next

            let newIdx = currentIndexRef.current
            if (next.length === 0) {
              newIdx = 0
            } else {
              if (removeIdx < newIdx) newIdx -= 1
              else if (removeIdx === newIdx && newIdx >= next.length) {
                newIdx = next.length - 1
              }
              if (newIdx >= next.length) newIdx = next.length - 1
            }

            currentIndexRef.current = newIdx
            setCurrentIndex(newIdx)
            return next
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'greetings' },
        (payload) => {
          const deletedId =
            typeof (payload.old as { id?: unknown }).id === 'string'
              ? (payload.old as { id: string }).id
              : null
          if (!deletedId) return

          setGreetings((prev) => {
            const removeIdx = prev.findIndex((g) => g.id === deletedId)
            if (removeIdx === -1) return prev

            const next = prev.filter((g) => g.id !== deletedId)
            greetingsRef.current = next

            let newIdx = currentIndexRef.current
            if (next.length === 0) {
              newIdx = 0
            } else {
              if (removeIdx < newIdx) newIdx -= 1
              else if (removeIdx === newIdx && newIdx >= next.length) {
                newIdx = next.length - 1
              }
              if (newIdx >= next.length) newIdx = next.length - 1
            }

            currentIndexRef.current = newIdx
            setCurrentIndex(newIdx)
            return next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queueNewGreeting])

  const spawnScoreCelebration = useCallback(
    (deltas: Array<{ tableId: string; delta: number }>) => {
      const canvas = mainCanvasRef.current
      if (!canvas || deltas.length === 0) return

      const canvasRect = canvas.getBoundingClientRect()
      setConfettiFire((n) => n + 1)

      const nextCoins: FlyingBeatCoin[] = []
      for (const { tableId, delta } of deltas) {
        if (delta <= 0) continue
        const card = teamCardRefs.current[tableId]
        const cardRect = card?.getBoundingClientRect()
        const startX = canvasRect.width * (0.55 + Math.random() * 0.15)
        const startY = canvasRect.height * (0.35 + Math.random() * 0.2)
        const endX = cardRect
          ? cardRect.left + cardRect.width * 0.35 - canvasRect.left
          : canvasRect.width * 0.82
        const endY = cardRect
          ? cardRect.top + cardRect.height * 0.5 - canvasRect.top
          : canvasRect.height * 0.5

        nextCoins.push({
          id: `${tableId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
          tableId,
          points: delta,
          startX,
          startY,
          endX,
          endY,
        })
      }

      if (nextCoins.length > 0) {
        setFlyingCoins((prev) => [...prev, ...nextCoins].slice(-12))
      }
    },
    []
  )

  const applyLiveBundle = useCallback(
    (next: LeaderboardEntry[], recent: RecentActivityItem[]) => {
      const prev = prevLeaderboardRef.current
      const nextRowAnim: Record<string, { delta?: number }> = {}
      const celebrationDeltas: Array<{ tableId: string; delta: number }> = []

      if (prev && prev.length > 0 && next.length > 0) {
        const oldPts = new Map(prev.map((e) => [e.tableId, e.totalPoints]))
        next.forEach((e) => {
          const op = oldPts.get(e.tableId)
          if (op === undefined) return
          const delta = e.totalPoints > op ? e.totalPoints - op : undefined
          if (delta != null && delta > 0) {
            nextRowAnim[e.tableId] = { delta }
            celebrationDeltas.push({ tableId: e.tableId, delta })
          }
        })
      }

      prevLeaderboardRef.current = next

      if (animClearRef.current) clearTimeout(animClearRef.current)
      setRowAnim(nextRowAnim)
      setLeaderboard(next)
      setRecentActivity(recent)
      setLeaderboardError(null)

      if (celebrationDeltas.length > 0) {
        spawnScoreCelebration(celebrationDeltas)
        animClearRef.current = setTimeout(() => setRowAnim({}), 1800)
      }
    },
    [spawnScoreCelebration]
  )

  const refreshLiveData = useCallback(async () => {
    try {
      const { leaderboard: next, recentActivity: recent } = await fetchLiveBundle()
      applyLiveBundle(next, recent)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load leaderboard'
      setLeaderboardError(msg)
      setLeaderboard((prev) => prev)
      setRecentActivity((prev) => prev)
    } finally {
      setLeaderboardLoading(false)
    }
  }, [applyLiveBundle])

  useEffect(() => {
    void refreshLiveData()
  }, [refreshLiveData])

  useEffect(() => {
    const channel = supabase
      .channel('display-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'completions' },
        () => {
          void refreshLiveData()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mission_submissions',
          filter: 'status=eq.approved',
        },
        () => {
          void refreshLiveData()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mission_submissions',
          filter: 'status=eq.approved',
        },
        () => {
          void refreshLiveData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refreshLiveData])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void refreshLiveData()
    }, LIVE_POLL_MS)
    return () => window.clearInterval(id)
  }, [refreshLiveData])

  const leaderboardTableIdsKey = useMemo(() => {
    const ids = new Set<string>()
    if (leaderboard?.length) {
      for (const e of leaderboard) ids.add(e.tableId)
    }
    if (currentGreeting?.table_id) ids.add(currentGreeting.table_id)
    return [...ids].sort().join(',')
  }, [leaderboard, currentGreeting?.table_id])

  useEffect(() => {
    if (!leaderboardTableIdsKey) return
    let cancelled = false
    const ids = leaderboardTableIdsKey.split(',')
    void (async () => {
      const visuals = await fetchDisplayTeamVisuals(supabase, ids)
      if (cancelled) return
      setTeamVisuals((prev) => ({ ...prev, ...visuals }))
      const avatars: Record<string, string> = {}
      for (const [id, v] of Object.entries(visuals)) {
        if (v.avatarUrl) avatars[id] = v.avatarUrl
      }
      setTeamAvatars((prev) => ({ ...prev, ...avatars }))
    })()
    return () => {
      cancelled = true
    }
  }, [leaderboardTableIdsKey])

  useEffect(() => {
    return () => {
      if (animClearRef.current) clearTimeout(animClearRef.current)
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

  const leaderboardEntries = leaderboard ?? []

  if (greetingLoading && !currentGreeting) {
    return (
      <div ref={containerRef} className={DISPLAY_GRID_CLASS}>
        <div className="flex min-w-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-900/50">
          <span className="text-zinc-500">Loading…</span>
        </div>
        <LeaderboardSidebar
          entries={[]}
          teamVisuals={{}}
          teamAvatars={{}}
          rankEmblems={rankEmblems}
          rowAnim={{}}
          isFullscreen={false}
          onRequestFullscreen={requestFullscreen}
          loading
          error={null}
          teamCardRefs={teamCardRefs}
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className={DISPLAY_GRID_CLASS}>
      <div
        ref={mainCanvasRef}
        className="relative min-w-0 overflow-hidden rounded-2xl bg-zinc-900"
      >
        {!currentGreeting ? (
          <div className="flex h-full w-full flex-col items-center justify-center px-8">
            <div className="mb-6 h-px w-16 bg-zinc-600" />
            <p className="text-xl font-medium tracking-wide text-zinc-400">
              Greetings will appear here
            </p>
            <p className="mt-3 text-center text-sm text-zinc-500">
              Share the upload link with guests to see their messages on this screen.
            </p>
          </div>
        ) : (
          <div key={currentGreeting.id} className="absolute inset-0 animate-[fadeIn_0.7s_ease-out]">
            <ImageWithFallback
              src={currentGreeting.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <GreetingSpeechBubble
              greeting={currentGreeting}
              teamVisual={greetingTeamVisual}
            />
          </div>
        )}

        <MomentumFeed
          items={feedItems}
          teamVisuals={teamVisuals}
          teamAvatars={teamAvatars}
        />

        <DisplayConfetti fireKey={confettiFire} />
        <BeatCoinFlyLayer coins={flyingCoins} />
      </div>

      <LeaderboardSidebar
        entries={leaderboardEntries}
        teamVisuals={teamVisuals}
        teamAvatars={teamAvatars}
        rankEmblems={rankEmblems}
        rowAnim={rowAnim}
        isFullscreen={isFullscreen}
        onRequestFullscreen={requestFullscreen}
        loading={leaderboardLoading}
        error={leaderboardError}
        teamCardRefs={teamCardRefs}
      />
    </div>
  )
}
