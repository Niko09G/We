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

  const scope = typeof body.scope === 'string' ? body.scope.trim() : ''
  const table_id = typeof body.table_id === 'string' ? body.table_id.trim() : null
  const mission_id = typeof body.mission_id === 'string' ? body.mission_id.trim() : null
  const submission_id =
    typeof body.submission_id === 'string' ? body.submission_id.trim() : null
  const token_id = typeof body.token_id === 'string' ? body.token_id.trim() : null
  const greeting_id = typeof body.greeting_id === 'string' ? body.greeting_id.trim() : null
  const note = typeof body.note === 'string' ? body.note.trim() : null
  const actor = typeof body.actor === 'string' ? body.actor.trim() : null

  if (!scope) {
    return NextResponse.json({ ok: false, error: 'scope_required' } as const, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc('admin_reset_with_archive', {
      p_scope: scope,
      p_table_id: table_id,
      p_mission_id: mission_id,
      p_submission_id: submission_id,
      p_token_id: token_id,
      p_greeting_id: greeting_id,
      p_note: note,
      p_actor: actor,
    })
    if (error) throw new Error(error.message)
    const row = data as { ok?: boolean; error?: string } | null
    if (!row || row.ok !== true) {
      return NextResponse.json(
        { ok: false, error: row?.error ?? 'reset_failed' } as const,
        { status: 422 }
      )
    }
    return NextResponse.json(row)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'reset_failed'
    return NextResponse.json({ ok: false, error: msg } as const, { status: 500 })
  }
}

