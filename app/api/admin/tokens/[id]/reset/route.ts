import { NextResponse } from 'next/server'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

/**
 * POST: unclaim a token — clear claim fields and remove the associated beatcoin
 * mission_submission so leaderboard points stay consistent.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'misconfigured',
        message: 'Set SUPABASE_SERVICE_ROLE_KEY on the server.',
      } as const,
      { status: 503 }
    )
  }

  const { id: tokenId } = await context.params
  if (!tokenId || typeof tokenId !== 'string') {
    return NextResponse.json({ ok: false as const, error: 'Missing token id.' }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc('admin_reset_with_archive', {
      p_scope: 'single_token',
      p_token_id: tokenId,
      p_note: 'Token reset from Tokens admin page',
      p_actor: null,
    })

    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error(
          'Missing admin_reset_with_archive RPC. Run supabase/schema/reset_archive_recovery.sql and retry.'
        )
      }
      throw new Error(error.message)
    }
    const row = data as
      | { ok?: boolean; error?: string; archived_submissions?: number; batch_id?: string }
      | null
    if (!row || row.ok !== true) {
      if (row?.error === 'token_not_found') {
        return NextResponse.json({ ok: false as const, error: 'Token not found.' }, { status: 404 })
      }
      throw new Error(row?.error || 'Token reset failed.')
    }

    return NextResponse.json({
      ok: true as const,
      deleted_submissions:
        typeof row.archived_submissions === 'number' ? row.archived_submissions : 0,
      message:
        (row.archived_submissions ?? 0) > 0
          ? `Token reset (archived in batch ${String(row.batch_id ?? '').slice(0, 8)}).`
          : 'Token was already available or had no linked submission.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to reset token.'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}
