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
  fetchDisplayGreetingsSince,
  recordGreetingDisplayed,
  type GreetingRow,
} from '@/lib/greetings-admin'
import {
  fetchGuestEmblemsConfig,
  type GuestEmblemsSettingsValue,
} from '@/lib/guest-emblem-config'
import type { LeaderboardEntry, RecentActivityItem } from '@/lib/leaderboard'
import { leaderboardEntryTeamKey } from '@/lib/leaderboard'
import { supabase } from '@/lib/supabase/client'

const DISPLAY_GRID_CLASS = 'grid h-screen w-screen grid-cols-[8.6fr_3.4fr] gap-6 bg-zinc-950 p-6'

const GREETING_ROTATE_MS = 10_000
const FALLBACK_POLL_MS = 5_000
const FALLBACK_GREETING_LIMIT = 5
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

  const sourceTypeRaw = row.source_type
  const source_type: GreetingRow['source_type'] =
    sourceTypeRaw === 'mission' ? 'mission' : 'upload'

  return {
    id,
    message,
    image_url,
    status,
    created_at,
    name: typeof row.name === 'string' ? row.name : null,
    source_type,
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
  const [unseenQueue, setUnseenQueue] = useState<GreetingRow[]>([])
  const [recycledPool, setRecycledPool] = useState<GreetingRow[]>([])
  const [recycledIndex, setRecycledIndex] = useState(0)
  const [activeGreeting, setActiveGreeting] = useState<GreetingRow | null>(null)
  const [isShowingRecycled, setIsShowingRecycled] = useState(false)
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
  const unseenQueueRef = useRef<GreetingRow[]>([])
  const recycledPoolRef = useRef<GreetingRow[]>([])
  const recycledIndexRef = useRef(0)
  const activeGreetingRef = useRef<GreetingRow | null>(null)
  const isShowingRecycledRef = useRef(false)
  const rotateIntervalRef = useRef<number | ReturnType<typeof setInterval> | null>(null)
  const prevLeaderboardRef = useRef<LeaderboardEntry[] | null>(null)
  const teamCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const animClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxSeenCreatedAtRef = useRef<string | null>(null)

  const feedItems = useMomentumFeed(recentActivity)

  const currentGreeting = activeGreeting

  const greetingTeamVisual = useMemo(() => {
    if (!currentGreeting?.table_id) return null
    return teamVisuals[currentGreeting.table_id] ?? null
  }, [currentGreeting, teamVisuals])

  const bumpRotationTimer = useCallback(() => {
    setRotationEpoch((n) => n + 1)
  }, [])

  const touchMaxSeenCreatedAt = useCallback((createdAt: string) => {
    const current = maxSeenCreatedAtRef.current
    if (!current || new Date(createdAt).getTime() > new Date(current).getTime()) {
      maxSeenCreatedAtRef.current = createdAt
    }
  }, [])

  const recordDisplayed = useCallback((greeting: GreetingRow | null) => {
    if (!greeting) return
    void recordGreetingDisplayed(greeting.id).catch(() => {
      /* RPC or columns not migrated yet */
    })
  }, [])

  const showFromUnseenQueue = useCallback(
    (options?: { resetTimer?: boolean }) => {
      const queue = unseenQueueRef.current
      if (queue.length === 0) return false

      const next = queue[0]
      const rest = queue.slice(1)
      unseenQueueRef.current = rest
      setUnseenQueue(rest)

      const pool = [...recycledPoolRef.current, next]
      recycledPoolRef.current = pool
      setRecycledPool(pool)

      activeGreetingRef.current = next
      setActiveGreeting(next)
      isShowingRecycledRef.current = false
      setIsShowingRecycled(false)

      if (options?.resetTimer) bumpRotationTimer()
      return true
    },
    [bumpRotationTimer]
  )

  const showRecycledAtIndex = useCallback((index: number) => {
    const pool = recycledPoolRef.current
    if (pool.length === 0) return false

    const idx = ((index % pool.length) + pool.length) % pool.length
    const next = pool[idx] ?? null
    if (!next) return false

    recycledIndexRef.current = idx
    setRecycledIndex(idx)
    activeGreetingRef.current = next
    setActiveGreeting(next)
    isShowingRecycledRef.current = true
    setIsShowingRecycled(true)
    return true
  }, [])

  const rotateGreeting = useCallback(() => {
    recordDisplayed(activeGreetingRef.current)

    if (unseenQueueRef.current.length > 0) {
      showFromUnseenQueue()
      return
    }

    const pool = recycledPoolRef.current
    if (pool.length === 0) {
      activeGreetingRef.current = null
      setActiveGreeting(null)
      isShowingRecycledRef.current = false
      setIsShowingRecycled(false)
      return
    }

    const nextIdx = (recycledIndexRef.current + 1) % pool.length
    showRecycledAtIndex(nextIdx)
  }, [recordDisplayed, showFromUnseenQueue, showRecycledAtIndex])

  const enqueueUnseenGreeting = useCallback(
    (row: GreetingRow) => {
      if (row.status !== 'ready') return

      touchMaxSeenCreatedAt(row.created_at)

      const withoutDup = unseenQueueRef.current.filter((g) => g.id !== row.id)
      const nextQueue = [...withoutDup, row]
      unseenQueueRef.current = nextQueue
      setUnseenQueue(nextQueue)

      if (isShowingRecycledRef.current) {
        recordDisplayed(activeGreetingRef.current)
        showFromUnseenQueue({ resetTimer: true })
      }
    },
    [recordDisplayed, showFromUnseenQueue, touchMaxSeenCreatedAt]
  )

  const removeGreetingFromQueues = useCallback(
    (greetingId: string) => {
      const nextUnseen = unseenQueueRef.current.filter((g) => g.id !== greetingId)
      unseenQueueRef.current = nextUnseen
      setUnseenQueue(nextUnseen)

      const removeIdx = recycledPoolRef.current.findIndex((g) => g.id === greetingId)
      if (removeIdx === -1) return

      const nextPool = recycledPoolRef.current.filter((g) => g.id !== greetingId)
      recycledPoolRef.current = nextPool
      setRecycledPool(nextPool)

      let nextIdx = recycledIndexRef.current
      if (nextPool.length === 0) {
        nextIdx = 0
      } else if (removeIdx < nextIdx) {
        nextIdx -= 1
      } else if (removeIdx === nextIdx) {
        nextIdx = Math.min(nextIdx, nextPool.length - 1)
      }
      if (nextIdx >= nextPool.length) nextIdx = Math.max(0, nextPool.length - 1)

      recycledIndexRef.current = nextIdx
      setRecycledIndex(nextIdx)

      if (activeGreetingRef.current?.id === greetingId) {
        if (nextUnseen.length > 0) {
          showFromUnseenQueue({ resetTimer: true })
        } else if (nextPool.length > 0) {
          showRecycledAtIndex(nextIdx)
          bumpRotationTimer()
        } else {
          activeGreetingRef.current = null
          setActiveGreeting(null)
          isShowingRecycledRef.current = false
          setIsShowingRecycled(false)
        }
      }
    },
    [bumpRotationTimer, showFromUnseenQueue, showRecycledAtIndex]
  )

  const loadGreetings = useCallback(async () => {
    try {
      const pool = sortGreetingsNewestFirst(await fetchDisplayGreetings())
      for (const row of pool) {
        touchMaxSeenCreatedAt(row.created_at)
      }
      recycledPoolRef.current = pool
      setRecycledPool(pool)
      unseenQueueRef.current = []
      setUnseenQueue([])
      recycledIndexRef.current = 0
      setRecycledIndex(0)

      if (pool.length > 0) {
        activeGreetingRef.current = pool[0]
        setActiveGreeting(pool[0])
        isShowingRecycledRef.current = true
        setIsShowingRecycled(true)
      } else {
        activeGreetingRef.current = null
        setActiveGreeting(null)
        isShowingRecycledRef.current = false
        setIsShowingRecycled(false)
      }
      bumpRotationTimer()
    } catch {
      recycledPoolRef.current = []
      setRecycledPool([])
      unseenQueueRef.current = []
      setUnseenQueue([])
      recycledIndexRef.current = 0
      setRecycledIndex(0)
      activeGreetingRef.current = null
      setActiveGreeting(null)
      isShowingRecycledRef.current = false
      setIsShowingRecycled(false)
    } finally {
      setGreetingLoading(false)
    }
  }, [bumpRotationTimer, touchMaxSeenCreatedAt])

  useEffect(() => {
    void loadGreetings()
  }, [loadGreetings])

  useEffect(() => {
    unseenQueueRef.current = unseenQueue
  }, [unseenQueue])

  useEffect(() => {
    recycledPoolRef.current = recycledPool
  }, [recycledPool])

  useEffect(() => {
    recycledIndexRef.current = recycledIndex
  }, [recycledIndex])

  useEffect(() => {
    activeGreetingRef.current = activeGreeting
  }, [activeGreeting])

  useEffect(() => {
    isShowingRecycledRef.current = isShowingRecycled
  }, [isShowingRecycled])

  useEffect(() => {
    if (rotateIntervalRef.current) {
      clearInterval(rotateIntervalRef.current)
      rotateIntervalRef.current = null
    }

    const hasGreetings =
      recycledPool.length > 0 || unseenQueue.length > 0 || activeGreeting !== null
    if (!hasGreetings) return

    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      rotateGreeting()
    }, GREETING_ROTATE_MS)

    rotateIntervalRef.current = id

    return () => {
      clearInterval(id)
      if (rotateIntervalRef.current === id) rotateIntervalRef.current = null
    }
  }, [recycledPool.length, unseenQueue.length, rotationEpoch, rotateGreeting])

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
        const oldPts = new Map(prev.map((e) => [leaderboardEntryTeamKey(e), e.totalPoints]))
        next.forEach((e) => {
          const teamKey = leaderboardEntryTeamKey(e)
          const op = oldPts.get(teamKey)
          if (op === undefined) return
          const delta = e.totalPoints > op ? e.totalPoints - op : undefined
          if (delta != null && delta > 0) {
            nextRowAnim[teamKey] = { delta }
            celebrationDeltas.push({ tableId: teamKey, delta })
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

  const pollDisplayFallback = useCallback(async () => {
    try {
      const rows = await fetchDisplayGreetingsSince(
        maxSeenCreatedAtRef.current,
        FALLBACK_GREETING_LIMIT
      )
      for (const row of rows) {
        enqueueUnseenGreeting(row)
      }
    } catch {
      /* polling safety net — ignore transient errors */
    }

    void refreshLiveData()
  }, [enqueueUnseenGreeting, refreshLiveData])

  useEffect(() => {
    void refreshLiveData()
  }, [refreshLiveData])

  useEffect(() => {
    const id = window.setInterval(() => {
      void pollDisplayFallback()
    }, FALLBACK_POLL_MS)
    return () => window.clearInterval(id)
  }, [pollDisplayFallback])

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    let resubscribeTimer: number | null = null

    const attachRealtimeChannel = () => {
      if (cancelled) return

      channel = supabase
        .channel('display-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'greetings' },
          (payload) => {
            console.log('Realtime greeting received:', payload)
            const row = greetingFromRealtimeRow(
              payload.new as Record<string, unknown>
            )
            if (row) enqueueUnseenGreeting(row)
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
              enqueueUnseenGreeting(row)
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

            removeGreetingFromQueues(updatedId)
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

            removeGreetingFromQueues(deletedId)
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tables' },
          () => {
            void refreshLiveData()
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'completions' },
          () => {
            void refreshLiveData()
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'mission_submissions' },
          () => {
            void refreshLiveData()
          }
        )
        .subscribe((status) => {
          console.log('Realtime status:', status)
          if (cancelled) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (channel) {
              supabase.removeChannel(channel)
              channel = null
            }
            resubscribeTimer = window.setTimeout(attachRealtimeChannel, 2_000)
          }
        })
    }

    attachRealtimeChannel()

    return () => {
      cancelled = true
      if (resubscribeTimer) window.clearTimeout(resubscribeTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [enqueueUnseenGreeting, removeGreetingFromQueues, refreshLiveData])

  const leaderboardTableIdsKey = useMemo(() => {
    const ids = new Set<string>()
    if (leaderboard?.length) {
      for (const e of leaderboard) {
        ids.add(leaderboardEntryTeamKey(e))
        for (const memberId of e.memberTableIds ?? []) ids.add(memberId)
      }
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
