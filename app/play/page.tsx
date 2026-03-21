'use client'

import Link from 'next/link'

/**
 * Lobby — onboarding & light participation.
 * Table selection → `/missions`; team hub → `/missions/[tableId]`.
 */
export default function PlayPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300/90">
            Together we celebrate
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
            Welcome
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/70">
            Find your spot, send love to the couple, then join your table for quests
            and the friendly leaderboard.
          </p>
        </header>

        <Link
          href="/seat"
          className="group relative block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 px-6 py-5 text-center font-bold text-white shadow-xl shadow-violet-950/50 transition duration-200 active:scale-[0.99] motion-safe:hover:shadow-2xl motion-safe:hover:shadow-violet-900/40"
        >
          <span className="relative z-10 text-lg">Find your seat</span>
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 motion-safe:group-hover:opacity-30 bg-white/20"
            aria-hidden
          />
        </Link>
        <p className="mt-3 text-center text-xs text-white/50">
          After that, choose your table to jump into the team page.
        </p>

        <div className="mt-10 space-y-3">
          <Link
            href="/upload"
            className="flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-zinc-800/70 px-5 py-4 text-left shadow-lg transition active:scale-[0.99] motion-safe:hover:border-white/20 motion-safe:hover:bg-zinc-800"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl ring-1 ring-white/10"
              aria-hidden
            >
              💌
            </span>
            <div>
              <p className="font-semibold text-white">Send a greeting</p>
              <p className="text-xs text-white/60">Photo or message for the couple</p>
            </div>
          </Link>

          <Link
            href="/display"
            className="flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-zinc-800/70 px-5 py-4 text-left shadow-lg transition active:scale-[0.99] motion-safe:hover:border-white/20 motion-safe:hover:bg-zinc-800"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl ring-1 ring-white/10"
              aria-hidden
            >
              ✨
            </span>
            <div>
              <p className="font-semibold text-white">View greetings</p>
              <p className="text-xs text-white/60">See the live wall & leaderboard</p>
            </div>
          </Link>

          <Link
            href="/program"
            className="flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-zinc-800/70 px-5 py-4 text-left shadow-lg transition active:scale-[0.99] motion-safe:hover:border-white/20 motion-safe:hover:bg-zinc-800"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl ring-1 ring-white/10"
              aria-hidden
            >
              📅
            </span>
            <div>
              <p className="font-semibold text-white">Program & info</p>
              <p className="text-xs text-white/60">What’s happening today</p>
            </div>
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-4 text-center">
          <p className="text-xs text-white/55">Already know your table?</p>
          <Link
            href="/missions"
            className="mt-2 inline-flex text-sm font-semibold text-violet-300 underline-offset-2 hover:underline"
          >
            Choose your team →
          </Link>
        </div>
      </div>
    </main>
  )
}
