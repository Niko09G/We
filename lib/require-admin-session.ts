import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ADMIN_AUTH_COOKIE_NAME,
  verifyAdminSessionCookieValue,
} from '@/lib/auth-session'

export async function isAdminSessionValid(): Promise<boolean> {
  const cookieStore = await cookies()
  const value = cookieStore.get(ADMIN_AUTH_COOKIE_NAME)?.value
  return verifyAdminSessionCookieValue(value)
}

export async function requireAdminSessionOrRespond(): Promise<NextResponse | null> {
  const valid = await isAdminSessionValid()
  if (valid) return null
  return NextResponse.json(
    { ok: false as const, error: 'Unauthorized. Please sign in again.' },
    { status: 401 }
  )
}
