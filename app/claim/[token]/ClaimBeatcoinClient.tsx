'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DynamicThemeColor } from '@/components/DynamicThemeColor'
import { RewardAmount } from '@/components/reward/RewardAmount'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import {
  claimBeatcoinToken,
  lookupBeatcoinToken,
  type BeatcoinLookupOk,
} from '@/lib/admin-tokens'
import {
  readGuestTableContext,
  saveGuestTableContext,
  type GuestTableContext,
} from '@/lib/guest-table-context'
import { rewardUnitCompactLabel } from '@/lib/reward-unit'
import { canonicalTablesForLobby, resolveTeamId } from '@/lib/table-teams'
import { teamPageAdminFormDefaults } from '@/lib/team-page-config'
import { supabase } from '@/lib/supabase/client'

type GuestTable = {
  id: string
  name: string
  color: string | null
  is_active: boolean
  team_id?: string | null
  display_order?: number
  page_config?: unknown
}

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function BeatcoinHero({ points }: { points: number }) {
  const { config: rewardUnit } = useRewardUnit()
  return (
    <div className="flex flex-col items-center text-center">
      <div className="animate-[beatcoin-pop_2s_ease-in-out_infinite]">
        <RewardUnitIcon size={96} className="drop-shadow-md" />
      </div>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        You found a {rewardUnit.name}!
      </h1>
      <p className="mt-2 flex items-center justify-center gap-2 text-3xl font-extrabold tabular-nums text-violet-600">
        <RewardAmount showPlus amount={points} iconSize={32} displayVariant="default" />
      </p>
    </div>
  )
}

function BeatcoinHeroStatic({ points, title }: { points: number; title: string }) {
  const { config: rewardUnit } = useRewardUnit()
  return (
    <div className="flex flex-col items-center text-center">
      <RewardUnitIcon size={80} className="drop-shadow-sm" />
      <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
      {points > 0 ? (
        <p className="mt-2 flex items-center justify-center gap-2 text-2xl font-extrabold tabular-nums text-violet-600">
          <RewardAmount showPlus amount={points} iconSize={28} displayVariant="default" />
        </p>
      ) : null}
      <p className="sr-only">{rewardUnit.name}</p>
    </div>
  )
}

function TableAvatarBadge({ table }: { table: GuestTable }) {
  const resolved = teamPageAdminFormDefaults(table.page_config, {
    tableColor: table.color,
    tableName: table.name,
  })
  const art =
    resolved.avatarImageUrl.trim() || resolved.heroImageUrl.trim() || null

  return (
    <div
      className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
      style={{
        background: art
          ? undefined
          : `linear-gradient(to bottom right, ${resolved.heroTop}, ${resolved.heroBottom})`,
      }}
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        <span className="text-lg font-bold text-white">{table.name.slice(0, 1)}</span>
      )}
    </div>
  )
}

function TablePickerCard({
  table,
  disabled,
  onSelect,
}: {
  table: GuestTable
  disabled: boolean
  onSelect: (tableId: string) => void
}) {
  const resolved = teamPageAdminFormDefaults(table.page_config, {
    tableColor: table.color,
    tableName: table.name,
  })
  const art =
    resolved.heroImageUrl.trim() || resolved.avatarImageUrl.trim() || null

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(table.id)}
      className="group relative h-[220px] w-full overflow-hidden rounded-2xl border border-zinc-200 text-left outline-none transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:border-zinc-300 enabled:hover:shadow-sm focus-visible:ring-2 focus-visible:ring-zinc-400/70 focus-visible:ring-offset-2 disabled:opacity-60 sm:h-[250px]"
      style={{
        background: `linear-gradient(to bottom, ${resolved.heroTop}, ${resolved.heroMiddle || resolved.heroBottom}, ${resolved.heroBottom})`,
      }}
    >
      <div className="relative flex h-full flex-col p-3 text-white">
        <p className="relative z-[1] text-center text-sm font-bold leading-tight sm:text-base">
          {table.name}
        </p>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt=""
            className="relative z-[1] mx-auto mt-2 h-28 w-full max-w-full flex-1 object-contain opacity-95 sm:h-32"
          />
        ) : null}
      </div>
    </button>
  )
}

export default function ClaimBeatcoinClient({ token }: { token: string }) {
  const { config: rewardUnit } = useRewardUnit()

  const [phase, setPhase] = useState<
    | 'loading'
    | 'invalid'
    | 'claimed'
    | 'pick_table'
    | 'ready'
    | 'success'
    | 'error'
  >('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lookup, setLookup] = useState<BeatcoinLookupOk | null>(null)
  const [remembered, setRemembered] = useState<GuestTableContext | null>(null)
  const [tables, setTables] = useState<GuestTable[]>([])
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const activeTable = useMemo(
    () => tables.find((t) => t.id === activeTableId) ?? null,
    [tables, activeTableId]
  )

  const loadTables = useCallback(async () => {
    const [{ data, error }, teamsRes] = await Promise.all([
      supabase
        .from('tables')
        .select('id,name,color,is_active,team_id,display_order,page_config')
        .eq('is_archived', false)
        .order('name'),
      supabase.from('teams').select('id,name'),
    ])
    if (error || teamsRes.error) return []
    const teamNameById = new Map<string, string>()
    for (const row of teamsRes.data ?? []) {
      teamNameById.set(row.id as string, (row.name as string) ?? '')
    }
    const rows = (data ?? []) as GuestTable[]
    const activeRows = rows
      .filter((t) => (t.is_active ?? true) === true)
      .filter((t) => isUuid(t.id))
    return canonicalTablesForLobby(activeRows).map((t) => ({
      ...t,
      name: teamNameById.get(resolveTeamId(t))?.trim() || t.name,
    }))
  }, [])

  const bootstrap = useCallback(async () => {
    if (!token) {
      setPhase('invalid')
      return
    }
    setPhase('loading')
    setErrorMessage(null)

    try {
      const [baseLookup, tableList, ctx] = await Promise.all([
        lookupBeatcoinToken(token),
        loadTables(),
        Promise.resolve(readGuestTableContext()),
      ])

      if (baseLookup.ok !== true) {
        setPhase('invalid')
        return
      }

      setLookup(baseLookup)
      setTables(tableList)
      setRemembered(ctx)

      if (ctx?.tableId) {
        const scoped = await lookupBeatcoinToken(token, ctx.tableId)
        if (scoped.ok === true && scoped.already_claimed) {
          setActiveTableId(ctx.tableId)
          setPhase('claimed')
          return
        }
        setActiveTableId(ctx.tableId)
        setPhase('ready')
        return
      }

      setPhase('pick_table')
    } catch {
      setPhase('invalid')
    }
  }, [token, loadTables])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const claimForTable = useCallback(
    async (tableId: string, tableName: string) => {
      if (!lookup) return
      setIsSubmitting(true)
      setErrorMessage(null)
      setActiveTableId(tableId)

      try {
        const data = await claimBeatcoinToken(token, tableId)
        if (data.ok !== true) {
          const code = data.error ?? 'claim_failed'
          if (code === 'already_claimed_by_table') {
            setPhase('claimed')
            return
          }
          setErrorMessage(
            code === 'missions_disabled'
              ? 'Missions are paused right now.'
              : code === 'mission_not_assigned'
                ? 'This mission is not available for that team.'
                : code === 'invalid_token'
                  ? `This ${rewardUnit.name} link is not valid.`
                  : 'Could not claim. Try again.'
          )
          setPhase(remembered?.tableId ? 'ready' : 'pick_table')
          return
        }

        setPointsAwarded(typeof data.points === 'number' ? data.points : lookup.points)
        saveGuestTableContext(tableId, tableName)
        setPhase('success')
      } catch {
        setErrorMessage('Network error. Try again.')
        setPhase(remembered?.tableId ? 'ready' : 'pick_table')
      } finally {
        setIsSubmitting(false)
      }
    },
    [lookup, token, rewardUnit.name, remembered]
  )

  const rememberedTable = useMemo(
    () => tables.find((t) => t.id === remembered?.tableId) ?? null,
    [tables, remembered]
  )

  const displayTable = activeTable ?? rememberedTable
  const displayTableName =
    displayTable?.name || remembered?.tableName || 'Your table'

  return (
    <main className="guest-page-shell min-h-[100dvh] bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-slate-900">
      <DynamicThemeColor color="#ffffff" />
      <style jsx global>{`
        @keyframes beatcoin-pop {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
      `}</style>

      <div className="mx-auto w-full max-w-md">
        {phase === 'loading' ? (
          <div className="mt-16 flex flex-col items-center gap-4">
            <div className="h-24 w-24 animate-pulse rounded-full bg-zinc-100" />
            <p className="text-sm text-zinc-500">Discovering your reward…</p>
          </div>
        ) : null}

        {phase === 'invalid' ? (
          <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <RewardUnitIcon size={64} className="opacity-40" />
            <p className="mt-4 text-lg font-semibold text-slate-900">This link isn&apos;t valid</p>
            <p className="mt-2 text-sm text-zinc-600">
              Check the QR or ask a host for a fresh {rewardUnit.name} link.
            </p>
            <Link
              href="/missions"
              className="mt-8 inline-block w-full rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white"
            >
              Go to Missions
            </Link>
          </div>
        ) : null}

        {phase === 'claimed' && lookup ? (
          <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <BeatcoinHeroStatic points={lookup.points} title="Already claimed!" />
            {displayTable ? <TableAvatarBadge table={displayTable} /> : null}
            <p className="mt-5 text-base text-slate-700">
              Your table{' '}
              <span className="font-semibold text-slate-900">({displayTableName})</span> has already
              claimed this {rewardUnit.name}!
            </p>
            <Link
              href={activeTableId ? `/missions/${activeTableId}` : '/missions'}
              className="mt-8 inline-block w-full rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white"
            >
              Go to Missions
            </Link>
          </div>
        ) : null}

        {phase === 'pick_table' && lookup ? (
          <div className="mt-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <BeatcoinHero points={lookup.points} />
              <p className="mt-6 text-center text-sm font-medium text-zinc-600">
                Select your table to claim
              </p>
            </div>

            {errorMessage ? (
              <p className="mt-4 text-center text-sm text-amber-700">{errorMessage}</p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
              {tables.map((t) => (
                <TablePickerCard
                  key={t.id}
                  table={t}
                  disabled={isSubmitting}
                  onSelect={(id) => void claimForTable(id, t.name)}
                />
              ))}
            </div>

            {isSubmitting ? (
              <p className="mt-4 text-center text-sm text-zinc-500">Claiming…</p>
            ) : null}

            <Link
              href="/missions"
              className="mt-6 block text-center text-sm font-medium text-zinc-500 underline underline-offset-2"
            >
              Cancel
            </Link>
          </div>
        ) : null}

        {phase === 'ready' && lookup && remembered ? (
          <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <BeatcoinHero points={lookup.points} />
            <div className="mt-6 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-5">
              <p className="text-sm font-medium text-zinc-600">
                Claim for your table
              </p>
              {rememberedTable ? <TableAvatarBadge table={rememberedTable} /> : null}
              <p className="mt-3 text-xl font-bold text-slate-900">{remembered.tableName}</p>
              <button
                type="button"
                onClick={() => setPhase('pick_table')}
                className="mt-4 text-sm font-medium text-violet-600 underline underline-offset-2"
              >
                Not your table? Select here
              </button>
            </div>

            {errorMessage ? (
              <p className="mt-4 text-sm text-amber-700">{errorMessage}</p>
            ) : null}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void claimForTable(remembered.tableId, remembered.tableName)}
              className="mt-8 w-full rounded-2xl bg-violet-600 py-4 text-base font-bold text-white shadow-md transition enabled:hover:bg-violet-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Claiming…' : `Claim ${rewardUnit.name}`}
            </button>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900">Something went wrong</p>
            <p className="mt-2 text-sm text-zinc-600">{errorMessage}</p>
            <button
              type="button"
              onClick={() => void bootstrap()}
              className="mt-8 w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : null}

        {phase === 'success' && lookup ? (
          <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <div className="flex flex-col items-center">
              <div className="animate-[beatcoin-pop_1.5s_ease-in-out_infinite]">
                <RewardUnitIcon size={88} className="drop-shadow-md" />
              </div>
              <p className="mt-4 text-2xl font-extrabold text-emerald-600">Claimed!</p>
              <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-2xl font-bold text-slate-900">
                <RewardAmount
                  showPlus
                  amount={pointsAwarded ?? lookup.points}
                  iconSize={28}
                  displayVariant="default"
                />
                <span className="text-lg font-semibold text-zinc-600">added</span>
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Added to your team {rewardUnitCompactLabel(rewardUnit)} total.
              </p>
              {displayTable ? (
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5">
                  <span
                    className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full"
                    style={{
                      background: (() => {
                        const resolved = teamPageAdminFormDefaults(displayTable.page_config, {
                          tableColor: displayTable.color,
                          tableName: displayTable.name,
                        })
                        const art =
                          resolved.avatarImageUrl.trim() || resolved.heroImageUrl.trim()
                        return art
                          ? undefined
                          : `linear-gradient(to bottom right, ${resolved.heroTop}, ${resolved.heroBottom})`
                      })(),
                    }}
                  >
                    {(() => {
                      const resolved = teamPageAdminFormDefaults(displayTable.page_config, {
                        tableColor: displayTable.color,
                        tableName: displayTable.name,
                      })
                      const art =
                        resolved.avatarImageUrl.trim() || resolved.heroImageUrl.trim() || null
                      return art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={art} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-xs font-bold text-white">
                          {displayTable.name.slice(0, 1)}
                        </span>
                      )
                    })()}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{displayTableName}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="/display"
                className="w-full rounded-2xl bg-violet-600 py-3.5 text-center text-sm font-semibold text-white"
              >
                View Leaderboard
              </Link>
              <Link
                href={activeTableId ? `/missions/${activeTableId}` : '/missions'}
                className="w-full rounded-2xl border border-zinc-200 bg-white py-3.5 text-center text-sm font-semibold text-slate-900"
              >
                Go to Missions
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
