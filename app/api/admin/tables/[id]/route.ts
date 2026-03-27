import { NextResponse } from 'next/server'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        ok: false as const,
        error: 'misconfigured',
        message: 'Set SUPABASE_SERVICE_ROLE_KEY on the server.',
      },
      { status: 503 }
    )
  }

  const { id } = await context.params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ ok: false as const, error: 'Missing table id.' }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()

    const { data: existing, error: lookupError } = await supabase
      .from('tables')
      .select('id, is_archived')
      .eq('id', id)
      .maybeSingle<{ id: string; is_archived: boolean }>()

    if (lookupError) throw new Error(lookupError.message || 'Failed to check table state.')
    if (!existing) {
      return NextResponse.json({ ok: false as const, error: 'Table not found.' }, { status: 404 })
    }
    if (!existing.is_archived) {
      return NextResponse.json(
        { ok: false as const, error: 'Archive the table first before permanent deletion.' },
        { status: 409 }
      )
    }

    const { data: deletedRows, error: deleteError } = await supabase
      .from('tables')
      .delete()
      .eq('id', id)
      .select('id')

    if (deleteError) throw new Error(deleteError.message || 'Failed to delete table.')
    if (!deletedRows || deletedRows.length === 0) {
      throw new Error('Table was not deleted.')
    }

    return NextResponse.json({ ok: true as const, id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete table.'
    return NextResponse.json({ ok: false as const, error: message }, { status: 500 })
  }
}
