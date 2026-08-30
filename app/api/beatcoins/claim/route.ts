import { NextResponse } from 'next/server'
import { isBeatcoinTokenUuid, normalizeClaimTokenInput } from '@/lib/admin-tokens'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'
import { lookupBeatcoinTokenRow } from '@/lib/tokens'

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
  const token =
    typeof body.token === 'string' ? normalizeClaimTokenInput(body.token) : ''
  const table_id = readTableId(body)

  if (!token || !table_id) {
    return NextResponse.json({ error: 'missing_token_or_table' }, { status: 400 })
  }

  if (!isBeatcoinTokenUuid(table_id)) {
    return NextResponse.json({ error: 'invalid_table_id' }, { status: 400 })
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

  let tokenData: Awaited<ReturnType<typeof lookupBeatcoinTokenRow>>
  try {
    tokenData = await lookupBeatcoinTokenRow(supabase, token)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to look up token'
    console.error('[BeatCoin Claim Error]:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (!tokenData) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const tokenIdString = String(tokenData.id)
  const tableIdString = String(table_id).trim().toLowerCase()

  const { data: existingRedemption, error: redemptionLookupError } = await supabase
    .from('token_redemptions')
    .select('*')
    .eq('token_id', tokenIdString)
    .eq('table_id', tableIdString)
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
    token_id: tokenIdString,
    table_id: tableIdString,
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

  const points = typeof tokenData.points === 'number' ? tokenData.points : Number(tokenData.points)

  const { error: submissionError } = await supabase.from('mission_submissions').insert({
    table_id: tableIdString,
    mission_id: tokenData.mission_id,
    status: 'approved',
    submission_type: 'beatcoin',
    submission_data: {
      beatcoin_token_id: tokenIdString,
      points_awarded: points,
    },
    approved_at: new Date().toISOString(),
  })

  if (submissionError) {
    console.error('[BeatCoin Claim Error]:', submissionError)
    return NextResponse.json({ error: submissionError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, points })
}
