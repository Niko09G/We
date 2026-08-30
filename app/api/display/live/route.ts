import { NextResponse } from 'next/server'

import { fetchLeaderboardBundleWithClient } from '@/lib/leaderboard'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Lightweight JSON for big-screen display — scores + recent activity, no images. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const recentLimit = Math.min(12, Math.max(0, Number(url.searchParams.get('recent') ?? 8)))

  try {
    const supabase = createServerSupabaseClient()
    const { leaderboard, recentActivity, tableNames } = await fetchLeaderboardBundleWithClient(
      supabase,
      recentLimit
    )
    return NextResponse.json(
      { leaderboard, recentActivity, tableNames },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load live display data'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
