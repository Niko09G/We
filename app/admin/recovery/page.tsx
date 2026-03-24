'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMissions, type MissionRecord } from '@/lib/admin-missions'
import { listTablesForAdmin, type AdminTableRow } from '@/lib/admin-tables'
import { listMissionSubmissionsForAdmin, type MissionSubmissionRow } from '@/lib/admin-mission-submissions'
import {
  adminResetWithArchive,
  adminRestoreBatch,
  listResetBatches,
  type ResetBatchRow,
} from '@/lib/admin-recovery'

type TokenRow = {
  id: string
  token: string
  claimed_at: string | null
}

function fmtIso(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

export default function AdminRecoveryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const [tables, setTables] = useState<AdminTableRow[]>([])
  const [missions, setMissions] = useState<MissionRecord[]>([])
  const [submissions, setSubmissions] = useState<MissionSubmissionRow[]>([])
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [batches, setBatches] = useState<ResetBatchRow[]>([])

  const [tableId, setTableId] = useState('')
  const [missionId, setMissionId] = useState('')
  const [submissionId, setSubmissionId] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [note, setNote] = useState('')
  const [actor, setActor] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const claimedTokens = useMemo(() => tokens.filter((t) => t.claimed_at), [tokens])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ts, ms, subs, tokenRes, bs] = await Promise.all([
        listTablesForAdmin(),
        listMissions(),
        listMissionSubmissionsForAdmin(100),
        fetch('/api/admin/tokens').then((r) => r.json() as Promise<{ tokens?: TokenRow[] }>),
        listResetBatches(),
      ])
      setTables(ts)
      setMissions(ms)
      setSubmissions(subs)
      setTokens(tokenRes.tokens ?? [])
      setBatches(bs)
      setTableId((prev) => prev || ts[0]?.id || '')
      setMissionId((prev) => prev || ms[0]?.id || '')
      setSubmissionId((prev) => prev || subs[0]?.id || '')
      setTokenId((prev) => prev || (tokenRes.tokens?.find((t) => t.claimed_at)?.id ?? ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recovery data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function doReset(scope: Parameters<typeof adminResetWithArchive>[0]['scope']) {
    const highRisk =
      scope === 'event_all_progress' ||
      scope === 'mission_all_teams' ||
      scope === 'table_all_progress' ||
      scope === 'event_token_claims'
    if (highRisk && confirmText.trim().toUpperCase() !== 'RESET') {
      setError('Type RESET in the confirmation box before running this action.')
      return
    }
    if (
      !window.confirm(
        'Proceed with reset? This archives affected rows and is restorable from reset history.'
      )
    ) {
      return
    }
    setRunning(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await adminResetWithArchive({
        scope,
        table_id: tableId || null,
        mission_id: missionId || null,
        submission_id: submissionId || null,
        token_id: tokenId || null,
        note: note.trim() || null,
        actor: actor.trim() || null,
      })
      setSuccess(
        `Reset archived (batch ${String(res.batch_id).slice(0, 8)}): submissions=${res.archived_submissions ?? 0}, completions=${res.archived_completions ?? 0}, greetings=${res.archived_greetings ?? 0}, tokens=${res.reset_token_claims ?? 0}`
      )
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed.')
    } finally {
      setRunning(false)
    }
  }

  async function restoreBatch(batchId: string) {
    if (
      !window.confirm(
        'Restore this batch? This replays archived rows back into live state.'
      )
    ) {
      return
    }
    setRestoringId(batchId)
    setError(null)
    setSuccess(null)
    try {
      const res = await adminRestoreBatch(batchId, actor.trim() || null)
      setSuccess(
        `Restored batch ${String(res.batch_id).slice(0, 8)}: submissions=${res.restored_submissions ?? 0}, completions=${res.restored_completions ?? 0}, greetings=${res.restored_greetings ?? 0}, tokens=${res.restored_token_claims ?? 0}`
      )
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed.')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Recovery</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Resets archive affected rows into reset batches. Restores replay archived rows.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <section className="rounded border border-zinc-200 bg-white p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold">Reset controls</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Each reset archives affected submissions/completions/greetings/token claims into a batch.
          You can restore from history below.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input
            placeholder="Operator name (optional)"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <input
            placeholder="Reset note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:col-span-2"
          />
          <input
            placeholder='Type RESET for high-risk actions'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm dark:border-amber-700 dark:bg-amber-950/30 sm:col-span-2 lg:col-span-1"
          />
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <select
            value={submissionId}
            onChange={(e) => setSubmissionId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {submissions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.table_name} · {s.mission_title} · {s.status}
              </option>
            ))}
          </select>
          <select
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {claimedTokens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.token.slice(0, 8)}… ({fmtIso(t.claimed_at)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button title="Affects one submission (+ linked score/feed effects). Reversible." disabled={running || !submissionId} onClick={() => void doReset('single_submission')} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">
            Reset one submission
          </button>
          <button title="Affects one token claim and linked scoring effect. Token stays reusable. Reversible." disabled={running || !tokenId} onClick={() => void doReset('single_token')} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">
            Reset one token claim
          </button>
          <button title="Affects one mission for one team. Reversible." disabled={running || !missionId || !tableId} onClick={() => void doReset('mission_for_team')} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">
            Reset one mission for one team
          </button>
          <button title="High risk: affects one mission for all teams. Requires RESET text. Reversible." disabled={running || !missionId} onClick={() => void doReset('mission_all_teams')} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">
            Reset one mission for all teams
          </button>
          <button title="High risk: resets all progress for one team. Requires RESET text. Reversible." disabled={running || !tableId} onClick={() => void doReset('table_all_progress')} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">
            Reset all progress for one team
          </button>
          <button title="Highest risk: resets all event progress. Requires RESET text. Reversible via batch restore." disabled={running} onClick={() => void doReset('event_all_progress')} className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 disabled:opacity-40">
            Reset ALL event progress
          </button>
          <button title="High risk: clears all token claims event-wide (tokens stay valid). Requires RESET text. Reversible." disabled={running} onClick={() => void doReset('event_token_claims')} className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 disabled:opacity-40">
            Reset ALL token claims
          </button>
          <button title="Clears token claims for selected team only. Reversible." disabled={running || !tableId} onClick={() => void doReset('table_token_claims')} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">
            Reset team token claims
          </button>
          <button title="Clears feed content only (archived). Reversible." disabled={running} onClick={() => void doReset('content_feed')} className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs text-blue-900 disabled:opacity-40">
            Clear feed content (archive)
          </button>
        </div>
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold">Reset history & restore</h2>
        {loading ? (
          <p className="mt-2 text-sm text-zinc-500">Loading…</p>
        ) : batches.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No reset batches yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {batches.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">
                <div className="min-w-0">
                  <div className="font-medium">{b.scope}</div>
                  <div className="text-zinc-500">
                    {b.id.slice(0, 8)} · {fmtIso(b.created_at)} · {b.actor || 'unknown actor'}
                    {b.note ? ` · ${b.note}` : ''}
                  </div>
                </div>
                <div>
                  {b.restored_at ? (
                    <span className="text-emerald-700">Restored ({fmtIso(b.restored_at)})</span>
                  ) : (
                    <button
                      disabled={restoringId === b.id}
                      onClick={() => void restoreBatch(b.id)}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs"
                    >
                      {restoringId === b.id ? 'Restoring…' : 'Restore'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

