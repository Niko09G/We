import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let pin: unknown
  try {
    ;({ pin } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
  }

  if (String(pin).trim() !== String(process.env.ADMIN_PIN).trim()) {
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set('admin_authenticated', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  return NextResponse.json({ success: true })
}
