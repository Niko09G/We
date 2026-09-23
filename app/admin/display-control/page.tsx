'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import {
  displayOverlayLabel,
  fetchDisplayOverlayState,
  setDisplayAnnouncementMode,
  setDisplayOverlayMode,
  type DisplayOverlayMode,
} from '@/lib/display-settings'
import { supabase } from '@/lib/supabase/client'

type ModeCard = {
  mode: DisplayOverlayMode
  emoji: string
  title: string
  description: string
}

const MODE_CARDS: ModeCard[] = [
  {
    mode: 'leaderboard',
    emoji: '🏆',
    title: 'Live Leaderboard & Feed',
    description: 'Greetings carousel, momentum feed, and live scores.',
  },
  {
    mode: 'speech',
    emoji: '🎤',
    title: 'Speech / Presentation Mode',
    description: 'Clean ambient screen — hides floating feeds.',
  },
  {
    mode: 'announcement',
    emoji: '📣',
    title: 'Custom Announcement Screen',
    description: 'Full-screen message for the room.',
  },
]

export default function DisplayControlPage() {
  const [activeMode, setActiveMode] = useState<DisplayOverlayMode>('leaderboard')
  const [announcementDraft, setAnnouncementDraft] = useState('')
  const [liveAnnouncementText, setLiveAnnouncementText] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingMode, setPendingMode] = useState<DisplayOverlayMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadState = useCallback(async () => {
    setError(null)
    try {
      const state = await fetchDisplayOverlayState()
      setActiveMode(state.mode)
      setLiveAnnouncementText(state.announcementText)
      setAnnouncementDraft(state.announcementText)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load display state.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadState()
  }, [loadState])

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    let resubscribeTimer: number | null = null

    const attach = () => {
      if (cancelled) return
      channel = supabase
        .channel('display-control-settings')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'display_settings' },
          () => {
            void loadState()
          }
        )
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (channel) {
              supabase.removeChannel(channel)
              channel = null
            }
            resubscribeTimer = window.setTimeout(attach, 2_000)
          }
        })
    }

    attach()

    return () => {
      cancelled = true
      if (resubscribeTimer) window.clearTimeout(resubscribeTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [loadState])

  useEffect(() => {
    if (!success) return
    const t = window.setTimeout(() => setSuccess(null), 2800)
    return () => window.clearTimeout(t)
  }, [success])

  async function activateMode(mode: DisplayOverlayMode) {
    setPendingMode(mode)
    setError(null)
    setSuccess(null)
    try {
      if (mode === 'announcement') {
        await setDisplayAnnouncementMode(announcementDraft)
        setLiveAnnouncementText(announcementDraft.trim())
      } else {
        await setDisplayOverlayMode(mode)
      }
      setActiveMode(mode)
      setSuccess(`${displayOverlayLabel(mode)} is now live on the big screen.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update display.')
    } finally {
      setPendingMode(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 py-5 pb-10">
      <div className="mb-5">
        <Link
          href="/admin"
          className="text-sm font-medium text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline"
        >
          ← Admin
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
          Display Remote
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Switch what guests see on the live display screen.
        </p>
      </div>

      <div
        className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Live on screen
        </p>
        <p className="mt-1 text-lg font-semibold text-emerald-950">
          {loading ? 'Loading…' : displayOverlayLabel(activeMode)}
        </p>
        {activeMode === 'announcement' && liveAnnouncementText.trim() ? (
          <p className="mt-2 text-sm text-emerald-800/90">&ldquo;{liveAnnouncementText.trim()}&rdquo;</p>
        ) : null}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800" role="status">
          {success}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {MODE_CARDS.map((card) => {
          const isActive = activeMode === card.mode
          const isPending = pendingMode === card.mode
          return (
            <button
              key={card.mode}
              type="button"
              disabled={isPending || loading}
              onClick={() => void activateMode(card.mode)}
              className={`rounded-2xl border px-4 py-5 text-left transition active:scale-[0.99] disabled:opacity-60 ${
                isActive
                  ? 'border-[#5b38f2] bg-[#5b38f2]/8 shadow-[0_0_0_1px_rgba(91,56,242,0.25)]'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none" aria-hidden>
                  {card.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-zinc-900">{card.title}</p>
                    {isActive ? (
                      <span className="rounded-full bg-[#5b38f2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Live
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">{card.description}</p>
                  {isPending ? (
                    <p className="mt-2 text-xs font-medium text-[#5b38f2]">Sending…</p>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-zinc-800">Announcement text</span>
        <textarea
          value={announcementDraft}
          onChange={(e) => setAnnouncementDraft(e.target.value)}
          rows={3}
          placeholder="e.g. Cake cutting in 10 minutes!"
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base text-zinc-900 outline-none transition focus:border-[#5b38f2]"
        />
        <p className="mt-2 text-xs text-zinc-500">
          Tap the announcement card above to push this message to the display.
        </p>
      </label>

      <Link
        href="/display"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex h-12 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 hover:bg-zinc-50"
      >
        Open display screen ↗
      </Link>
    </main>
  )
}
