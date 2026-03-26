'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { RewardAmount } from '@/components/reward/RewardAmount'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { rewardUnitCompactLabel } from '@/lib/reward-unit'
import {
  readGuestTableContext,
  saveGuestTableContext,
  type GuestTableContext,
} from '@/lib/guest-table-context'

type LookupOk = {
  ok: true
  points: number
  mission_id: string
  already_claimed: boolean
}

type TableOption = { id: string; name: string }

export default function ClaimBeatcoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token: rawToken } = use(params)
  const token = decodeURIComponent(rawToken).trim()
  const { config: rewardUnit } = useRewardUnit()

  const [phase, setPhase] = useState<
    'loading' | 'invalid' | 'claimed' | 'ready' | 'submitting' | 'success' | 'error'
  >('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lookup, setLookup] = useState<LookupOk | null>(null)
  const [remembered, setRemembered] = useState<GuestTableContext | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [tables, setTables] = useState<TableOption[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string>('')
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null)
  const [successTableId, setSuccessTableId] = useState<string | null>(null)

  const effectiveTableId = useMemo(() => {
    if (showPicker && selectedTableId) return selectedTableId
    if (!showPicker && remembered?.tableId) return remembered.tableId
    return ''
  }, [showPicker, selectedTableId, remembered])

  const effectiveTableName = useMemo(() => {
    if (showPicker && selectedTableId) {
      const t = tables.find((x) => x.id === selectedTableId)
      return t?.name ?? ''
    }
    return remembered?.tableName ?? ''
  }, [showPicker, selectedTableId, tables, remembered])

  const loadLookup = useCallback(async () => {
    if (!token) {
      setPhase('invalid')
      return
    }
    setPhase('loading')
    setErrorMessage(null)
    try {
      const res = await fetch(
        `/api/beatcoins/lookup?${new URLSearchParams({ token })}`
      )
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok || data.ok !== true) {
        setPhase('invalid')
        return
      }
      const row = data as unknown as LookupOk
      setLookup(row)
      if (row.already_claimed) {
        setPhase('claimed')
        return
      }
      setPhase('ready')
    } catch {
      setPhase('invalid')
    }
  }, [token])

  useEffect(() => {
    void loadLookup()
  }, [loadLookup])

  useEffect(() => {
    if (phase !== 'ready') return
    const ctx = readGuestTableContext()
    setRemembered(ctx)
    if (!ctx) {
      setShowPicker(true)
    }
    ;(async () => {
      const { data, error } = await supabase
        .from('tables')
        .select('id,name')
        .eq('is_archived', false)
        .eq('is_active', true)
        .order('name')
      if (error) return
      setTables(
        ((data ?? []) as TableOption[]).map((r) => ({
          id: r.id,
          name: r.name,
        }))
      )
    })()
  }, [phase])

  async function onClaim() {
    if (!lookup || !effectiveTableId) {
      setErrorMessage('Choose your team first.')
      return
    }
    setPhase('submitting')
    setErrorMessage(null)
    try {
      const res = await fetch('/api/beatcoins/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, table_id: effectiveTableId }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; points?: number }
      if (!res.ok || data.ok !== true) {
        const code = data.error ?? 'claim_failed'
        if (code === 'already_claimed') {
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
        setPhase('error')
        return
      }
      setPointsAwarded(typeof data.points === 'number' ? data.points : lookup.points)
      const name = effectiveTableName || 'Your team'
      saveGuestTableContext(effectiveTableId, name)
      setSuccessTableId(effectiveTableId)
      setPhase('success')
    } catch {
      setErrorMessage('Network error. Try again.')
      setPhase('error')
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-violet-950 via-zinc-950 to-black px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
      <div className="mx-auto w-full max-w-md flex-1">
        <p className="text-center text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-violet-300/90">
          {rewardUnit.name}
        </p>

        {phase === 'loading' ? (
          <p className="mt-16 text-center text-sm text-zinc-400">Loading…</p>
        ) : null}

        {phase === 'invalid' ? (
          <div className="mt-12 text-center">
            <p className="text-lg font-semibold">This link isn&apos;t valid</p>
            <p className="mt-2 text-sm text-zinc-400">
              Check the QR or ask a host for a fresh {rewardUnit.name} link.
            </p>
            <Link
              href="/missions"
              className="mt-8 inline-block rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900"
            >
              Back to missions
            </Link>
          </div>
        ) : null}

        {phase === 'claimed' ? (
          <div className="mt-12 text-center">
            <p className="text-lg font-semibold">Already claimed</p>
            <p className="mt-2 text-sm text-zinc-400">
              This {rewardUnit.name} was already added to a team wallet.
            </p>
            <Link
              href="/missions"
              className="mt-8 inline-block rounded-2xl bg-white/10 px-6 py-3 text-sm font-semibold text-white"
            >
              Back to missions
            </Link>
          </div>
        ) : null}

        {phase === 'ready' || phase === 'submitting' || phase === 'error' ? (
          <div className="mt-8">
            {lookup ? (
              <p className="flex items-center justify-center gap-2 text-center text-3xl font-extrabold tabular-nums text-violet-300">
                <RewardAmount
                  showPlus
                  amount={lookup.points}
                  iconSize={28}
                  displayVariant="onDark"
                />
              </p>
            ) : null}

            {!showPicker && remembered ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-center backdrop-blur-sm">
                <p className="text-sm font-medium text-zinc-300">
                  This {rewardUnit.name} is about to be added to your team wallet
                </p>
                <p className="mt-3 text-xl font-bold text-white">{remembered.tableName}</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowPicker(true)
                    setSelectedTableId('')
                  }}
                  className="mt-4 text-sm font-medium text-violet-300 underline underline-offset-2"
                >
                  Not your team? Select here
                </button>
              </div>
            ) : null}

            {showPicker ? (
              <div className="mt-6">
                <label className="block text-center text-sm font-medium text-zinc-300">
                  Select your team to claim this {rewardUnit.name}
                </label>
                <select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="mt-3 w-full rounded-2xl border border-white/15 bg-zinc-900/80 px-4 py-3.5 text-base text-white outline-none focus:ring-2 focus:ring-violet-500/40"
                >
                  <option value="">Choose team…</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {remembered ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPicker(false)
                      setSelectedTableId('')
                    }}
                    className="mt-3 w-full text-center text-sm text-zinc-400 underline"
                  >
                    Use remembered team ({remembered.tableName})
                  </button>
                ) : null}
              </div>
            ) : null}

            {errorMessage ? (
              <p className="mt-4 text-center text-sm text-amber-300">{errorMessage}</p>
            ) : null}

            <div className="mt-10 flex flex-col gap-3">
              <button
                type="button"
                disabled={
                  phase === 'submitting' || !effectiveTableId || (showPicker && !selectedTableId)
                }
                onClick={() => void onClaim()}
                className="w-full rounded-2xl bg-violet-500 py-4 text-base font-bold text-white shadow-lg shadow-violet-900/40 transition enabled:active:scale-[0.99] enabled:hover:bg-violet-400 disabled:opacity-40"
              >
                {phase === 'submitting' ? 'Claiming…' : 'Claim'}
              </button>
              <Link
                href="/missions"
                className="text-center text-sm font-medium text-zinc-500 underline underline-offset-2"
              >
                Cancel
              </Link>
            </div>
          </div>
        ) : null}

        {phase === 'success' ? (
          <div className="mt-12 text-center">
            <p className="text-lg font-semibold text-emerald-400">Claimed!</p>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-2xl font-bold text-white">
              <RewardAmount
                showPlus
                amount={pointsAwarded ?? 0}
                iconSize={28}
                displayVariant="onDark"
              />
              <span className="text-lg font-semibold">added</span>
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Added to your team {rewardUnitCompactLabel(rewardUnit)} total.
            </p>
            <Link
              href={
                successTableId
                  ? `/missions/${successTableId}`
                  : '/missions'
              }
              className="mt-10 inline-block w-full rounded-2xl bg-white py-3.5 text-center text-sm font-semibold text-zinc-900"
            >
              Back to missions
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  )
}
