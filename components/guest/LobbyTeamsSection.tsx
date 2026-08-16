'use client'

import Link from 'next/link'
import { teamPageAdminFormDefaults } from '@/lib/team-page-config'

export type LobbyTeamRow = {
  id: string
  name: string
  color: string | null
  page_config: unknown
}

type LobbyTeamsSectionProps = {
  title: string
  description: string | null
  tables: LobbyTeamRow[]
}

export function LobbyTeamsSection({ title, description, tables }: LobbyTeamsSectionProps) {
  return (
    <section id="teams" className="w-full scroll-mt-8 px-5 pt-8 pb-10">
      <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">{title}</h2>
      {description?.trim() ? (
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-zinc-600">
          {description}
        </p>
      ) : null}

      {tables.length === 0 ? (
        <p className="mt-4 text-sm font-medium text-zinc-500">Teams will appear here soon.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
          {tables.map((row) => {
            const resolved = teamPageAdminFormDefaults(row.page_config, {
              tableColor: row.color,
              tableName: row.name,
            })
            return (
              <Link
                key={row.id}
                href={`/missions/${row.id}`}
                className="group relative h-[220px] overflow-hidden rounded-2xl border border-zinc-200 text-left outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-zinc-400/70 focus-visible:ring-offset-2 sm:h-[250px]"
                style={{
                  background: `linear-gradient(to bottom, ${resolved.heroTop}, ${resolved.heroMiddle || resolved.heroBottom}, ${resolved.heroBottom})`,
                }}
              >
                <div className="relative flex h-full flex-col p-3 text-white">
                  <p className="relative z-[1] text-center text-sm font-bold leading-tight sm:text-base">
                    {row.name}
                  </p>
                  {resolved.heroImageUrl.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolved.heroImageUrl.trim()}
                      alt=""
                      className="relative z-[1] mx-auto mt-2 h-28 w-full max-w-full flex-1 object-contain opacity-95 sm:h-32"
                    />
                  ) : null}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
