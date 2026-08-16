import { NextResponse } from 'next/server'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

type TokenRow = {
  id: string
  token: string
  mission_id: string
  points: number
  claimed_by_table_id: string | null
  claimed_at: string | null
  created_at: string
}

/** PATCH: update token amount (points only — token string and claim URL stay unchanged). */
export async function PATCH(
  req: Request,
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
    const body = (await req.json()) as { points?: unknown; amount?: unknown }
    const raw = body.points ?? body.amount
    const points = Math.floor(Number(raw))

    if (!Number.isFinite(points) || points < 0) {
      return NextResponse.json(
        { ok: false as const, error: 'Amount must be a non-negative integer.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('beatcoin_tokens')
      .update({ points })
      .eq('id', tokenId)
      .select('id, token, mission_id, points, claimed_by_table_id, claimed_at, created_at')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      return NextResponse.json({ ok: false as const, error: 'Token not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true as const, token: data as TokenRow })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update token amount.'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}
