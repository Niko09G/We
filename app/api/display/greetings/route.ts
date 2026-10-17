import { NextResponse } from 'next/server'

import { fetchDisplayGreetings } from '@/lib/greetings-admin'

export const dynamic = 'force-dynamic'

/** Ready greetings for the big screen — no images inlined, JSON only. */
export async function GET() {
  try {
    const greetings = await fetchDisplayGreetings()
    return NextResponse.json(greetings, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load greetings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
