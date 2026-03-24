export type ResetScope =
  | 'single_submission'
  | 'single_token'
  | 'single_greeting'
  | 'mission_for_team'
  | 'mission_all_teams'
  | 'table_all_progress'
  | 'event_all_progress'
  | 'content_feed'
  | 'table_token_claims'
  | 'event_token_claims'

export type ResetRequest = {
  scope: ResetScope
  table_id?: string | null
  mission_id?: string | null
  submission_id?: string | null
  token_id?: string | null
  greeting_id?: string | null
  note?: string | null
  actor?: string | null
}

export async function adminResetWithArchive(input: ResetRequest): Promise<Record<string, unknown>> {
  const res = await fetch('/api/admin/recovery/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || data.ok !== true) {
    throw new Error(String(data.error ?? 'Reset failed.'))
  }
  return data
}

export async function adminRestoreBatch(
  batch_id: string,
  actor?: string | null
): Promise<Record<string, unknown>> {
  const res = await fetch('/api/admin/recovery/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id, actor: actor ?? null }),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || data.ok !== true) {
    throw new Error(String(data.error ?? 'Restore failed.'))
  }
  return data
}

export type ResetBatchRow = {
  id: string
  scope: string
  note: string | null
  actor: string | null
  created_at: string
  restored_at: string | null
  restored_by: string | null
}

export async function listResetBatches(): Promise<ResetBatchRow[]> {
  const res = await fetch('/api/admin/recovery/batches')
  const data = (await res.json()) as { ok?: boolean; error?: string; batches?: ResetBatchRow[] }
  if (!res.ok || data.ok !== true) {
    throw new Error(data.error || 'Failed to load reset history.')
  }
  return data.batches ?? []
}

