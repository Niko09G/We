import { NextResponse } from 'next/server'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'misconfigured', message: 'Set SUPABASE_SERVICE_ROLE_KEY.' } as const,
      { status: 503 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' } as const, { status: 400 })
  }

  const batch_id = typeof body.batch_id === 'string' ? body.batch_id.trim() : ''
  const actor = typeof body.actor === 'string' ? body.actor.trim() : null
  if (!batch_id) {
    return NextResponse.json({ ok: false, error: 'batch_id_required' } as const, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc('admin_restore_reset_batch', {
      p_batch_id: batch_id,
      p_actor: actor,
    })
    if (error) throw new Error(error.message)
    const row = data as { ok?: boolean; error?: string } | null
    if (!row || row.ok !== true) {
      return NextResponse.json(
        { ok: false, error: row?.error ?? 'restore_failed' } as const,
        { status: 422 }
      )
    }
    return NextResponse.json(row)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'restore_failed'
    return NextResponse.json({ ok: false, error: msg } as const, { status: 500 })
  }
}

