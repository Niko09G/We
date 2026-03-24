'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { listMissions, type MissionRecord } from '@/lib/admin-missions'
import { rewardUnitCompactLabel } from '@/lib/reward-unit'
import { tokenClaimUrl } from '@/lib/admin-tokens'
import { copyTextWithFallback } from '@/lib/copy-text'
import { downloadClaimQrPng, qrDownloadFilename } from '@/lib/token-qr'
import TokenQrPreviewModal from './_components/TokenQrPreviewModal'

type EnrichedToken = {
  id: string
  token: string
  mission_id: string
  points: number
  claimed_by_table_id: string | null
  claimed_at: string | null
  created_at: string
  mission_title: string
  redeemed_by_name: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function truncateToken(t: string, head = 10, tail = 6): string {
  const s = t.trim()
  if (s.length <= head + tail + 3) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

export default function TokensAdminPage() {
  const { config: rewardUnit } = useRewardUnit()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [misconfigured, setMisconfigured] = useState(false)
  const [tokens, setTokens] = useState<EnrichedToken[]>([])
  const [missions, setMissions] = useState<MissionRecord[]>([])
  const [missionsLoading, setMissionsLoading] = useState(true)

  const [qty, setQty] = useState('10')
  const [points, setPoints] = useState('10')
  const [missionId, setMissionId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const [resettingId, setResettingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [previewToken, setPreviewToken] = useState<EnrichedToken | null>(null)
  const [downloadingQrId, setDownloadingQrId] = useState<string | null>(null)

  const beatcoinMissions = useMemo(
    () => missions.filter((m) => m.validation_type === 'beatcoin'),
    [missions]
  )

  const loadMissions = useCallback(async () => {
    setMissionsLoading(true)
    try {
      const list = await listMissions()
      setMissions(list)
      setMissionId((prev) => {
        if (prev) return prev
        const first = list.find((m) => m.validation_type === 'beatcoin')
        return first?.id ?? ''
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load missions.')
    } finally {
      setMissionsLoading(false)
    }
  }, [])

  const refreshTokens = useCallback(async () => {
    setLoading(true)
    setError(null)
    setMisconfigured(false)
    try {
      const res = await fetch('/api/admin/tokens')
      const data = (await res.json()) as
        | { ok: true; tokens: EnrichedToken[] }
        | { ok: false; error?: string; message?: string }

      if (!res.ok) {
        if (res.status === 503 && 'message' in data) {
          setMisconfigured(true)
          setTokens([])
          return
        }
        throw new Error(
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to load tokens.'
        )
      }
      if (!data.ok || !('tokens' in data)) throw new Error('Invalid response.')
      setTokens(data.tokens)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tokens.')
      setTokens([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMissions()
  }, [loadMissions])

  useEffect(() => {
    void refreshTokens()
  }, [refreshTokens])

  const summary = useMemo(() => {
    const total = tokens.length
    const claimed = tokens.filter((t) => t.claimed_at).length
    const available = total - claimed
    return { total, claimed, available }
  }, [tokens])

  async function handleGenerate() {
    setGenerating(true)
    setSuccess(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: Number(qty),
          points: Number(points),
          mission_id: missionId,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; created?: number }

      if (!res.ok) {
        if (res.status === 503 && data.error === 'misconfigured') {
          setMisconfigured(true)
          return
        }
        throw new Error(data.error || 'Generation failed.')
      }
      setSuccess(`Generated ${data.created ?? 0} token(s).`)
      await refreshTokens()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  async function copyClaimUrl(t: EnrichedToken) {
    const ok = await copyTextWithFallback(tokenClaimUrl(t.token))
    if (ok) {
      setCopiedId(t.id)
      window.setTimeout(() => setCopiedId(null), 2000)
    } else {
      setError('Could not copy URL. Use Download QR or open Preview and copy there.')
    }
  }

  async function handleDownloadQr(t: EnrichedToken) {
    setDownloadingQrId(t.id)
    setError(null)
    try {
      await downloadClaimQrPng(tokenClaimUrl(t.token), qrDownloadFilename(t.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate QR PNG.')
    } finally {
      setDownloadingQrId(null)
    }
  }

  async function handleReset(t: EnrichedToken) {
    const ok = window.confirm(
      'Reset this token?\n\n' +
        'The claim will be cleared so the token can be used again. ' +
        'If a claim submission exists for this token, it will be removed so leaderboard points stay accurate. ' +
        'If no matching submission is found (e.g. manual DB edits), only the token row is cleared.'
    )
    if (!ok) return

    setResettingId(t.id)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/admin/tokens/${t.id}/reset`, { method: 'POST' })
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string }

      if (!res.ok) {
        if (res.status === 503) {
          setMisconfigured(true)
          return
        }
        throw new Error(data.error || 'Reset failed.')
      }
      setSuccess(data.message || 'Token reset.')
      await refreshTokens()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed.')
    } finally {
      setResettingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Tokens</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Generate and manage claim links for token missions. For printed materials, use{' '}
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">Download QR</strong> (PNG) or{' '}
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">Preview</strong>
          — clipboard copy is optional. Guest flow:{' '}
          <code className="rounded bg-zinc-200/80 px-1 text-xs dark:bg-zinc-800">/claim/[token]</code>.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <RewardUnitIcon size={28} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Event reward unit
              </p>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {rewardUnit.name}
                {rewardUnit.short_label ? (
                  <span className="ml-1 text-xs font-normal text-zinc-500">({rewardUnit.short_label})</span>
                ) : null}
              </p>
            </div>
          </div>
          <Link
            href="/admin/settings"
            className="text-xs font-medium text-zinc-600 underline hover:no-underline dark:text-zinc-400"
          >
            Edit currency…
          </Link>
        </div>
      </div>

      {misconfigured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Server configuration needed</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            Add <code className="rounded bg-amber-200/80 px-1 text-xs dark:bg-amber-900/80">SUPABASE_SERVICE_ROLE_KEY</code> to
            your deployment environment. The <code className="rounded px-1 text-xs">beatcoin_tokens</code> table is not
            readable via the public anon key (RLS), so token admin uses the service role on the server only.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {success}
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Generate tokens</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Creates unique random tokens linked to a mission (validation type must be{' '}
          <span className="font-medium">beatcoin</span>).
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">Quantity</span>
            <input
              type="number"
              min={1}
              max={500}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1 font-medium">
              Amount
              <RewardUnitIcon size={14} title={rewardUnitCompactLabel(rewardUnit)} />
            </span>
            <input
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              title={`${rewardUnit.name} granted per token when claimed`}
            />
            <span className="text-[10px] text-zinc-500">Per token ({rewardUnit.name})</span>
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">Mission</span>
            <select
              value={missionId}
              onChange={(e) => setMissionId(e.target.value)}
              disabled={missionsLoading || beatcoinMissions.length === 0}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {beatcoinMissions.length === 0 ? (
                <option value="">No beatcoin missions — create one in Missions first</option>
              ) : (
                beatcoinMissions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            disabled={
              generating ||
              misconfigured ||
              !missionId ||
              beatcoinMissions.length === 0
            }
            onClick={() => void handleGenerate()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {generating ? 'Generating…' : 'Generate tokens'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">All tokens</h2>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <span>
              Total: <strong className="text-zinc-900 dark:text-zinc-200">{summary.total}</strong>
            </span>
            <span>
              Available:{' '}
              <strong className="text-emerald-700 dark:text-emerald-400">{summary.available}</strong>
            </span>
            <span>
              Claimed:{' '}
              <strong className="text-zinc-700 dark:text-zinc-300">{summary.claimed}</strong>
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : misconfigured ? (
            <p className="text-sm text-zinc-500">Configure the service role to list tokens.</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-zinc-500">No tokens yet. Generate a batch above.</p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                  <th className="pb-2 pr-2 font-medium">Token</th>
                  <th className="pb-2 pr-2 font-medium">
                    <span className="inline-flex items-center gap-1">
                      Amount
                      <RewardUnitIcon size={12} />
                    </span>
                  </th>
                  <th className="pb-2 pr-2 font-medium">Status</th>
                  <th className="pb-2 pr-2 font-medium">Redeemed by</th>
                  <th className="pb-2 pr-2 font-medium">Redeemed at</th>
                  <th className="pb-2 pr-2 font-medium">Mission</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800 dark:text-zinc-200">
                {tokens.map((t) => {
                  const claimed = Boolean(t.claimed_at)
                  const url = tokenClaimUrl(t.token)
                  return (
                    <tr key={t.id} className="border-b border-zinc-100 align-top dark:border-zinc-800">
                      <td className="py-2 pr-2 font-mono text-xs" title={t.token}>
                        {truncateToken(t.token)}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{t.points}</td>
                      <td className="py-2 pr-2">
                        {claimed ? (
                          <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 text-xs dark:bg-zinc-700">
                            Claimed
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                            Available
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 max-w-[140px] truncate" title={t.redeemed_by_name ?? ''}>
                        {t.redeemed_by_name ?? '—'}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                        {formatDate(t.claimed_at)}
                      </td>
                      <td className="py-2 pr-2 max-w-[160px] truncate" title={t.mission_title}>
                        {t.mission_title}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <button
                              type="button"
                              disabled={downloadingQrId === t.id || misconfigured}
                              onClick={() => void handleDownloadQr(t)}
                              className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                              {downloadingQrId === t.id ? 'Preparing…' : 'Download QR'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewToken(t)}
                              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              Preview
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-zinc-600 underline hover:no-underline dark:text-zinc-400"
                              title={url}
                            >
                              Open claim
                            </a>
                            <span className="text-zinc-300 dark:text-zinc-600">·</span>
                            <button
                              type="button"
                              onClick={() => void copyClaimUrl(t)}
                              className="font-medium text-zinc-500 underline hover:no-underline dark:text-zinc-500"
                            >
                              {copiedId === t.id ? 'Copied URL' : 'Copy URL'}
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={resettingId === t.id || misconfigured}
                            onClick={() => void handleReset(t)}
                            className="text-left text-xs font-medium text-amber-800 underline hover:no-underline dark:text-amber-300"
                          >
                            {resettingId === t.id ? '…' : 'Reset / Unclaim'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <TokenQrPreviewModal
        open={previewToken !== null}
        onClose={() => setPreviewToken(null)}
        claimUrl={previewToken ? tokenClaimUrl(previewToken.token) : ''}
        tokenId={previewToken?.id ?? ''}
        tokenPreview={previewToken ? truncateToken(previewToken.token) : ''}
      />
    </div>
  )
}
