import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/** Public: resolve QR token → points + claim status (no auth). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = (searchParams.get('token') ?? '').trim()
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' } as const, { status: 400 })
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>
  try {
    supabase = createServerSupabaseClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server configuration error'
    return NextResponse.json({ ok: false, error: msg } as const, { status: 500 })
  }

  const { data, error } = await supabase.rpc('peek_beatcoin', { p_token: token })
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message || 'lookup_failed' } as const,
      { status: 500 }
    )
  }

  const row = data as { ok?: boolean; error?: string; points?: number; mission_id?: string; already_claimed?: boolean } | null
  if (!row || row.ok !== true) {
    return NextResponse.json(
      { ok: false, error: row?.error ?? 'invalid_token' } as const,
      { status: 404 }
    )
  }

  return NextResponse.json({
    ok: true,
    points: row.points,
    mission_id: row.mission_id,
    already_claimed: row.already_claimed === true,
  })
}
