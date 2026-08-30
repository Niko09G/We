import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import type { AdminTokenRecord, TokenRedemptionRecord } from '@/lib/admin-tokens'
import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

/** Temporary: verify env at runtime (remove after debugging). */
function logServiceRoleKeyDebug() {
  console.log('SERVICE ROLE KEY EXISTS:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  console.log('KEY LENGTH:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length)
}

type TokenRow = {
  id: string
  token: string
  mission_id: string
  points: number
  created_at: string
}

type RedemptionRow = {
  token_id: string
  table_id: string
  redeemed_at: string
}

/** GET: list all tokens with mission title + redeemed table name (service role). */
export async function GET() {
  logServiceRoleKeyDebug()
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
      .select('id, token, mission_id, points, created_at')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    const rows = (tokens ?? []) as TokenRow[]
    const tokenIds = rows.map((r) => r.id)
    const missionIds = [...new Set(rows.map((r) => r.mission_id))]

    const [missionsRes, redemptionsRes] = await Promise.all([
      missionIds.length
        ? supabase.from('missions').select('id,title').in('id', missionIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
      tokenIds.length
        ? supabase
            .from('token_redemptions')
            .select('token_id, table_id, redeemed_at')
            .in('token_id', tokenIds)
            .order('redeemed_at', { ascending: false })
        : Promise.resolve({ data: [] as RedemptionRow[], error: null }),
    ])

    if ('error' in missionsRes && missionsRes.error)
      throw new Error(missionsRes.error.message)
    if ('error' in redemptionsRes && redemptionsRes.error)
      throw new Error(redemptionsRes.error.message)

    const redemptionRows = (redemptionsRes.data ?? []) as RedemptionRow[]
    const tableIds = [...new Set(redemptionRows.map((r) => r.table_id))]

    const tablesRes =
      tableIds.length > 0
        ? await supabase.from('tables').select('id,name').in('id', tableIds)
        : { data: [] as { id: string; name: string }[], error: null }

    if ('error' in tablesRes && tablesRes.error) throw new Error(tablesRes.error.message)

    const missionTitle = new Map(
      (missionsRes.data ?? []).map((m) => [m.id, m.title ?? ''])
    )
    const tableName = new Map(
      (tablesRes.data ?? []).map((t) => [t.id, t.name ?? ''])
    )

    const redemptionsByToken = new Map<string, TokenRedemptionRecord[]>()
    for (const row of redemptionRows) {
      const list = redemptionsByToken.get(row.token_id) ?? []
      list.push({
        table_id: row.table_id,
        table_name: tableName.get(row.table_id) ?? '—',
        redeemed_at: row.redeemed_at,
      })
      redemptionsByToken.set(row.token_id, list)
    }

    const enriched: AdminTokenRecord[] = rows.map((r) => {
      const redemptions = redemptionsByToken.get(r.id) ?? []
      return {
        id: r.id,
        token: r.token,
        mission_id: r.mission_id,
        points: r.points,
        created_at: r.created_at,
        mission_title: missionTitle.get(r.mission_id) ?? '—',
        redemption_count: redemptions.length,
        redemptions,
      }
    })

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
  logServiceRoleKeyDebug()
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
