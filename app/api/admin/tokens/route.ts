import { randomBytes } from 'crypto'
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

/** GET: list all tokens with mission title + redeemed table name (service role). */
export async function GET() {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'misconfigured',
        message:
          'Set SUPABASE_SERVICE_ROLE_KEY on the server to manage tokens (beatcoin_tokens is not exposed to anon).',
      } as const,
      { status: 503 }
    )
  }

  try {
    const supabase = createServiceRoleClient()
    const { data: tokens, error } = await supabase
      .from('beatcoin_tokens')
      .select(
        'id, token, mission_id, points, claimed_by_table_id, claimed_at, created_at'
      )
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    const rows = (tokens ?? []) as TokenRow[]
    const missionIds = [...new Set(rows.map((r) => r.mission_id))]
    const tableIds = [
      ...new Set(
        rows.map((r) => r.claimed_by_table_id).filter((id): id is string => Boolean(id))
      ),
    ]

    const [missionsRes, tablesRes] = await Promise.all([
      missionIds.length
        ? supabase.from('missions').select('id,title').in('id', missionIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
      tableIds.length
        ? supabase.from('tables').select('id,name').in('id', tableIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    ])

    if ('error' in missionsRes && missionsRes.error)
      throw new Error(missionsRes.error.message)
    if ('error' in tablesRes && tablesRes.error)
      throw new Error(tablesRes.error.message)

    const missionTitle = new Map(
      (missionsRes.data ?? []).map((m) => [m.id, m.title ?? ''])
    )
    const tableName = new Map(
      (tablesRes.data ?? []).map((t) => [t.id, t.name ?? ''])
    )

    const enriched = rows.map((r) => ({
      ...r,
      mission_title: missionTitle.get(r.mission_id) ?? '—',
      redeemed_by_name: r.claimed_by_table_id
        ? tableName.get(r.claimed_by_table_id) ?? '—'
        : null,
    }))

    return NextResponse.json({ ok: true as const, tokens: enriched })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load tokens.'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}

function randomTokenString(): string {
  return randomBytes(24).toString('base64url')
}

/** POST: generate a batch of tokens. Body: { quantity, points, mission_id } */
export async function POST(req: Request) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'misconfigured',
        message:
          'Set SUPABASE_SERVICE_ROLE_KEY on the server to generate tokens.',
      } as const,
      { status: 503 }
    )
  }

  try {
    const body = (await req.json()) as {
      quantity?: unknown
      points?: unknown
      mission_id?: unknown
    }

    const quantity = Math.floor(Number(body.quantity))
    const points = Math.floor(Number(body.points))
    const missionId =
      typeof body.mission_id === 'string' ? body.mission_id.trim() : ''

    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 500) {
      return NextResponse.json(
        { ok: false as const, error: 'Quantity must be between 1 and 500.' },
        { status: 400 }
      )
    }
    if (!Number.isFinite(points) || points < 0) {
      return NextResponse.json(
        { ok: false as const, error: 'Points must be a non-negative integer.' },
        { status: 400 }
      )
    }
    if (!missionId) {
      return NextResponse.json(
        { ok: false as const, error: 'mission_id is required.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()
    const { data: mission, error: mErr } = await supabase
      .from('missions')
      .select('id, validation_type')
      .eq('id', missionId)
      .maybeSingle()

    if (mErr) throw new Error(mErr.message)
    if (!mission || String(mission.validation_type) !== 'beatcoin') {
      return NextResponse.json(
        {
          ok: false as const,
          error: 'Mission must exist and have validation type "beatcoin".',
        },
        { status: 422 }
      )
    }

    const rows = Array.from({ length: quantity }, () => ({
      token: randomTokenString(),
      mission_id: missionId,
      points,
    }))

    const { data: inserted, error: insErr } = await supabase
      .from('beatcoin_tokens')
      .insert(rows)
      .select('id, token, mission_id, points, claimed_by_table_id, claimed_at, created_at')

    if (insErr) {
      if (insErr.code === '23505') {
        return NextResponse.json(
          {
            ok: false as const,
            error:
              'Token collision (extremely rare). Retry the batch; consider generating fewer at once.',
          },
          { status: 409 }
        )
      }
      throw new Error(insErr.message)
    }

    return NextResponse.json({
      ok: true as const,
      created: (inserted ?? []).length,
      tokens: inserted ?? [],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate tokens.'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}
