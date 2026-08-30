'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import {
  SNAPS_SHOT_POINTS,
  type SnapsActivityItem,
  type SnapsAwardResponse,
  type SnapsTeam,
  type SnapsTeamsResponse,
  type SnapsUndoResponse,
} from '@/lib/snaps'

type PendingUndo = {
  activityId: string
  teamId: string
  teamName: string
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

export default function SnapsHostPage() {
  const { config: rewardUnit } = useRewardUnit()
  const rewardName = rewardUnit.name || 'BeatCoin'

  const [teams, setTeams] = useState<SnapsTeam[]>([])
  const [recentActivity, setRecentActivity] = useState<SnapsActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [awardingIds, setAwardingIds] = useState<string[]>([])
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [toast, setToast] = useState<PendingUndo | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const awardingRef = useRef(new Set<string>())

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
  }, [])

  const loadTeams = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/snaps/teams', { cache: 'no-store' })
      const data = (await res.json()) as SnapsTeamsResponse
      if (!res.ok || !data.ok) {
        throw new Error(data.ok ? 'Failed to load teams.' : data.error)
      }
      setTeams(data.teams)
      setRecentActivity(data.recentActivity)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load teams.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTeams()
  }, [loadTeams])

  useEffect(() => {
    return () => clearToastTimer()
  }, [clearToastTimer])

  const dismissToast = useCallback(() => {
    clearToastTimer()
    setToast(null)
  }, [clearToastTimer])

  const showUndoToast = useCallback(
    (activity: SnapsActivityItem) => {
      clearToastTimer()
      setToast({
        activityId: activity.id,
        teamId: activity.teamId,
        teamName: activity.teamName,
      })
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null)
        toastTimerRef.current = null
      }, 5000)
    },
    [clearToastTimer]
  )

  const prependActivity = useCallback((activity: SnapsActivityItem) => {
    setRecentActivity((prev) => {
      const next = [activity, ...prev.filter((a) => a.id !== activity.id)]
      return next.slice(0, 3)
    })
  }, [])

  const removeActivity = useCallback((activityId: string) => {
    setRecentActivity((prev) => prev.filter((a) => a.id !== activityId))
  }, [])

  const undoActivity = useCallback(
    async (activityId: string) => {
      if (undoingId) return
      setUndoingId(activityId)
      setError(null)

      const previousActivity = recentActivity
      removeActivity(activityId)
      if (toast?.activityId === activityId) dismissToast()

      try {
        const res = await fetch('/api/snaps/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activityId }),
        })
        const data = (await res.json()) as SnapsUndoResponse
        if (!res.ok || !data.ok) {
          throw new Error(data.ok ? 'Undo failed.' : data.error)
        }
      } catch (e) {
        setRecentActivity(previousActivity)
        setError(e instanceof Error ? e.message : 'Undo failed.')
      } finally {
        setUndoingId(null)
      }
    },
    [dismissToast, recentActivity, removeActivity, toast?.activityId, undoingId]
  )

  const awardShot = useCallback(
    async (team: SnapsTeam) => {
      if (awardingRef.current.has(team.id)) return
      awardingRef.current.add(team.id)
      setAwardingIds([...awardingRef.current])
      setError(null)

      try {
        const res = await fetch('/api/snaps/award', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: team.id }),
        })
        const data = (await res.json()) as SnapsAwardResponse
        if (!res.ok || !data.ok) {
          throw new Error(data.ok ? 'Award failed.' : data.error)
        }
        prependActivity(data.activity)
        showUndoToast(data.activity)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not add points.')
      } finally {
        awardingRef.current.delete(team.id)
        setAwardingIds([...awardingRef.current])
      }
    },
    [prependActivity, showUndoToast]
  )

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-white text-slate-900">
      <header className="px-4 pt-6">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Snaps Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tap +{SNAPS_SHOT_POINTS} when a guest takes a shot for their team.
        </p>
      </header>

      {loading ? (
        <div className="grid flex-1 grid-cols-2 gap-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[38dvh] animate-pulse rounded-3xl bg-slate-200"
            />
          ))}
        </div>
      ) : error && teams.length === 0 ? (
        <div className="m-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-800">
          <p className="font-medium">Could not load teams</p>
          <p className="mt-1 text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              void loadTeams()
            }}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {error ? (
            <p className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : null}

          <div className="grid flex-1 grid-cols-2 gap-3 p-4">
            {teams.map((team) => {
              const busy = awardingIds.includes(team.id)
              const art = team.heroImageUrl?.trim() || team.avatarUrl?.trim() || null
              return (
                <article
                  key={team.id}
                  className="relative flex min-h-[38dvh] flex-col overflow-hidden rounded-3xl shadow-[0_10px_28px_rgba(15,23,42,0.18)]"
                  style={{ background: team.heroGradientCss }}
                >
                  <h2 className="relative z-10 px-3 pt-4 text-center text-lg font-black uppercase leading-tight tracking-tight text-white drop-shadow-md">
                    {team.name}
                  </h2>

                  <div className="relative flex min-h-0 flex-1 items-end justify-center overflow-hidden px-2">
                    {art ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={art}
                        alt=""
                        className="max-h-[78%] w-auto max-w-[92%] origin-bottom object-contain object-bottom drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
                      />
                    ) : (
                      <span className="mb-2 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/35 bg-white/15 text-2xl font-black text-white">
                        {teamInitials(team.name)}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void awardShot(team)}
                    className="relative z-10 mx-3 mb-3 mt-1 flex min-h-[4.75rem] flex-col items-center justify-center gap-0.5 rounded-2xl bg-black/30 px-3 py-3 text-center text-white ring-1 ring-white/25 transition active:scale-[0.98] disabled:opacity-60"
                  >
                    <span className="flex items-center gap-1.5 text-xl font-black leading-none">
                      <span>+{SNAPS_SHOT_POINTS}</span>
                      <RewardUnitIcon size={22} className="opacity-95" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/90">
                      Shot taken
                    </span>
                    {busy ? (
                      <span className="text-[11px] font-medium text-white/75">Saving…</span>
                    ) : null}
                  </button>
                </article>
              )
            })}
          </div>

          <section className="px-4 pb-28">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Recent activity
            </h3>
            {recentActivity.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No shots logged yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recentActivity.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">
                        <span className="font-semibold">+{item.points}</span> {rewardName} →{' '}
                        <span style={{ color: item.teamColor }} className="font-semibold">
                          {item.teamName}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">{formatTime(item.createdAt)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={undoingId === item.id || !!undoingId}
                      onClick={() => void undoActivity(item.id)}
                      className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {toast ? (
        <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
          <div className="flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl">
            <p className="text-sm text-slate-800">
              Added +{SNAPS_SHOT_POINTS} to{' '}
              <span className="font-semibold text-slate-900">{toast.teamName}</span>
            </p>
            <button
              type="button"
              disabled={undoingId === toast.activityId}
              onClick={() => void undoActivity(toast.activityId)}
              className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 transition hover:bg-amber-200 disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
