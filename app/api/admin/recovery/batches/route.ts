import { NextResponse } from 'next/server'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

export async function GET() {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'misconfigured', message: 'Set SUPABASE_SERVICE_ROLE_KEY.' } as const,
      { status: 503 }
    )
  }
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('reset_batches')
      .select('id,scope,note,actor,created_at,restored_at,restored_by')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true as const, batches: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'load_failed'
    return NextResponse.json({ ok: false, error: msg } as const, { status: 500 })
  }
}

