'use client'

import type { LobbyProgramItem } from '@/lib/lobby-settings'

type LobbyEventProgramSectionProps = {
  title: string
  description: string | null
  items: LobbyProgramItem[]
}

export function LobbyEventProgramSection({
  title,
  description,
  items,
}: LobbyEventProgramSectionProps) {
  return (
    <section id="event-program" className="w-full scroll-mt-8 px-5 pt-8 pb-6">
      <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">{title}</h2>
      {description?.trim() ? (
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-zinc-600">
          {description}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 text-sm font-medium text-zinc-500">
          The program will be posted here soon.
        </p>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200/80">
          {items.map((item, index) => (
            <div
              key={item.id}
              className={`grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-1 px-4 py-4 sm:grid-cols-[7rem_1fr] sm:px-5 ${
                index % 2 === 0 ? 'bg-white' : 'bg-neutral-50/80'
              } ${index > 0 ? 'border-t border-zinc-100' : ''}`}
            >
              <p className="text-sm font-semibold tabular-nums text-violet-700 sm:text-base">
                {item.time}
              </p>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 sm:text-base">{item.title}</p>
                {item.description?.trim() ? (
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">{item.description}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
