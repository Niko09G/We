import { NextResponse } from 'next/server'
import { normalizeClaimTokenInput } from '@/lib/admin-tokens'
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

  const { data: tokenRow, error: tokenLookupError } = await supabase
    .from('beatcoin_tokens')
    .select('id')
    .eq('token', rawToken)
    .maybeSingle()

  if (tokenLookupError) {
    console.error('[BeatCoin Claim Error]:', tokenLookupError)
    return NextResponse.json({ error: tokenLookupError.message }, { status: 500 })
  }

  if (!tokenRow) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const token_id = String(tokenRow.id)

  const { data: existingRedemption, error: redemptionLookupError } = await supabase
    .from('token_redemptions')
    .select('id')
    .eq('token_id', token_id)
    .eq('table_id', tableId)
    .maybeSingle()

  if (redemptionLookupError) {
    console.error('[BeatCoin Claim Error]:', redemptionLookupError)
    return NextResponse.json({ error: redemptionLookupError.message }, { status: 500 })
  }

  if (existingRedemption) {
    return NextResponse.json(
      { error: 'Your table has already claimed this BeatCoin!' },
      { status: 400 }
    )
  }

  const { error: redemptionInsertError } = await supabase.from('token_redemptions').insert({
    token_id,
    table_id: tableId,
  })

  if (redemptionInsertError) {
    console.error('[BeatCoin Claim Error]:', redemptionInsertError)
    if (redemptionInsertError.code === '23505') {
      return NextResponse.json(
        { error: 'Your table has already claimed this BeatCoin!' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: redemptionInsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
