'use client'

import type { LobbyMc } from '@/lib/lobby-settings'

type LobbyMcsSectionProps = {
  title: string
  description: string | null
  mcs: [LobbyMc, LobbyMc]
}

function McCard({ mc }: { mc: LobbyMc }) {
  const photo = mc.photo_url?.trim()
  return (
    <article className="flex flex-col items-start rounded-2xl border border-zinc-200 bg-white p-5 text-left">
      <div className="h-24 w-24 overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-violet-100 to-fuchsia-100">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl" aria-hidden>
            🎤
          </div>
        )}
      </div>
      <h3 className="mt-4 text-lg font-bold text-zinc-900">{mc.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{mc.description}</p>
    </article>
  )
}

export function LobbyMcsSection({ title, description, mcs }: LobbyMcsSectionProps) {
  return (
    <section id="mcs" className="w-full scroll-mt-8 px-5 pt-8 pb-6">
      <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">{title}</h2>
      {description?.trim() ? (
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-zinc-600">
          {description}
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <McCard mc={mcs[0]} />
        <McCard mc={mcs[1]} />
      </div>
    </section>
  )
}
