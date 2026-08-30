import { NextResponse } from 'next/server'
import { beatcoinClaimErrorMessage, normalizeClaimTokenInput } from '@/lib/admin-tokens'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

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

type ClaimBeatcoinRpcResult = {
  ok?: boolean
  error?: string
  points?: number
}

/** Public: claim a Beatcoin for a table (one redemption per token per table). */
export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const body = json as Record<string, unknown>
  const rawToken =
    typeof body.token === 'string' ? normalizeClaimTokenInput(body.token) : ''
  const tableId = readTableId(body)

  if (!rawToken || !tableId) {
    return NextResponse.json({ error: 'missing_token_or_table' }, { status: 400 })
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        error:
          'Set SUPABASE_SERVICE_ROLE_KEY on the server to claim BeatCoins (beatcoin_tokens is not exposed to anon).',
      },
      { status: 503 }
    )
  }

  let supabase: ReturnType<typeof createServiceRoleClient>
  try {
    supabase = createServiceRoleClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server configuration error'
    console.error('[BeatCoin Claim Error]:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data, error } = await supabase.rpc('claim_beatcoin', {
    p_token: rawToken,
    p_table_id: tableId,
  })

  if (error) {
    console.error('[BeatCoin Claim Error]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = (data ?? null) as ClaimBeatcoinRpcResult | null
  if (!result || result.ok !== true) {
    const code = result?.error?.trim() || 'claim_failed'
    const message = beatcoinClaimErrorMessage(code)
    const status =
      code === 'invalid_token' || code === 'table_not_found'
        ? 400
        : code === 'missions_disabled' ||
            code === 'mission_not_assigned' ||
            code === 'table_archived' ||
            code === 'table_inactive'
          ? 403
          : 400
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({
    success: true,
    points: typeof result.points === 'number' ? result.points : 0,
  })
}
