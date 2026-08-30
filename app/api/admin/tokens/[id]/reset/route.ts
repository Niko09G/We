import { NextResponse } from 'next/server'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'
import { resetBeatcoinTokenById } from '@/lib/tokens'

export const runtime = 'nodejs'

/**
 * POST: unclaim a token — remove token_redemptions, delete linked mission_submissions
 * (leaderboard deduction), and clear legacy claim fields.
 */
export async function POST(
  _req: Request,
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
    const supabase = createServiceRoleClient()
    const result = await resetBeatcoinTokenById(supabase, String(tokenId))

    if (!result.ok) {
      if (result.error === 'token_not_found') {
        return NextResponse.json({ ok: false as const, error: 'Token not found.' }, { status: 404 })
      }
      throw new Error(result.error)
    }

    return NextResponse.json({
      ok: true as const,
      deleted_submissions: result.deleted_submissions,
      deleted_redemptions: result.deleted_redemptions,
      already_available: result.already_available,
      message: result.message,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to reset token.'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}
