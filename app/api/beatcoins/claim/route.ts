import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/** Public: claim a Beatcoin for a table (idempotent token lock in RPC). */
export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' } as const, { status: 400 })
  }

  const body = json as Record<string, unknown>
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const table_id = typeof body.table_id === 'string' ? body.table_id.trim() : ''

  if (!token || !table_id) {
    return NextResponse.json(
      { ok: false, error: 'missing_token_or_table' } as const,
      { status: 400 }
    )
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>
  try {
    supabase = createServerSupabaseClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server configuration error'
    return NextResponse.json({ ok: false, error: msg } as const, { status: 500 })
  }

  const { data, error } = await supabase.rpc('claim_beatcoin', {
    p_token: token,
    p_table_id: table_id,
  })

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message || 'claim_failed' } as const,
      { status: 500 }
    )
  }

  const row = data as { ok?: boolean; error?: string; points?: number } | null
  if (!row || row.ok !== true) {
    const code = (row as { error?: string })?.error ?? 'claim_failed'
    const status =
      code === 'already_claimed' || code === 'invalid_token' ? 409 : code === 'missions_disabled' ? 503 : 422
    return NextResponse.json({ ok: false, error: code } as const, { status })
  }

  return NextResponse.json({
    ok: true,
    points: row.points,
    mission_submission_id: (row as { mission_submission_id?: string }).mission_submission_id,
  })
}
