import { NextResponse } from 'next/server'
import { isBeatcoinTokenUuid, normalizeClaimTokenInput } from '@/lib/admin-tokens'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  buildClaimBeatcoinRpcArgs,
  isPostgresUuidTextMismatchError,
  isTokenRedemptionMigrationError,
  resolveBeatcoinTokenForClaim,
  tokenRedemptionMigrationMessage,
} from '@/lib/tokens'

export const dynamic = 'force-dynamic'

function readTableId(body: Record<string, unknown>): string {
  const raw =
    typeof body.table_id === 'string'
      ? body.table_id
      : typeof body.tableId === 'string'
        ? body.tableId
        : ''
  return raw.trim()
}

/** Public: claim a Beatcoin for a table (one redemption per token per table). */
export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' } as const, { status: 400 })
  }

  const body = json as Record<string, unknown>
  const token =
    typeof body.token === 'string' ? normalizeClaimTokenInput(body.token) : ''
  const table_id = readTableId(body)

  if (!token || !table_id) {
    return NextResponse.json(
      { ok: false, error: 'missing_token_or_table' } as const,
      { status: 400 }
    )
  }

  if (!isBeatcoinTokenUuid(table_id)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_table_id' } as const,
      { status: 400 }
    )
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>
  try {
    supabase = createServerSupabaseClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server configuration error'
    console.error('[BeatCoin Claim Error]:', e)
    return NextResponse.json({ ok: false, error: msg } as const, { status: 500 })
  }

  // Resolve to the opaque token string (text column) so claim RPC never compares id (uuid) to text.
  const claimToken = await resolveBeatcoinTokenForClaim(supabase, token)
  if (!claimToken) {
    return NextResponse.json(
      { ok: false, error: 'missing_token_or_table' } as const,
      { status: 400 }
    )
  }

  const { data, error } = await supabase.rpc(
    'claim_beatcoin',
    buildClaimBeatcoinRpcArgs(claimToken, table_id)
  )

  if (error) {
    console.error('[BeatCoin Claim Error]:', error)
    if (isPostgresUuidTextMismatchError(error)) {
      console.error(
        '[BeatCoin Claim Error]: Postgres text/uuid mismatch — deploy beatcoin_token_lookup_fix.sql'
      )
    }
    if (isTokenRedemptionMigrationError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'missing_migration',
          message: tokenRedemptionMigrationMessage(),
        } as const,
        { status: 503 }
      )
    }
    return NextResponse.json(
      { ok: false, error: error.message || 'claim_failed' } as const,
      { status: 500 }
    )
  }

  const row = data as { ok?: boolean; error?: string; points?: number } | null
  if (!row || row.ok !== true) {
    const rawCode = (row as { error?: string })?.error ?? 'claim_failed'
    const code =
      rawCode === 'already_claimed' ? 'already_claimed_by_table' : rawCode
    console.error('[BeatCoin Claim Error]:', row)
    const status =
      code === 'already_claimed_by_table' || code === 'invalid_token'
        ? 409
        : code === 'missions_disabled'
          ? 503
          : 422
    return NextResponse.json({ ok: false, error: code } as const, { status })
  }

  return NextResponse.json({
    ok: true,
    points: row.points,
    mission_submission_id: (row as { mission_submission_id?: string }).mission_submission_id,
  })
}
