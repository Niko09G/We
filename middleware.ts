import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  ADMIN_AUTH_COOKIE_NAME,
  verifyAdminSessionCookieValue,
} from '@/lib/auth-session'

export async function middleware(request: NextRequest) {
  const cookieValue = request.cookies.get(ADMIN_AUTH_COOKIE_NAME)?.value
  const authenticated = await verifyAdminSessionCookieValue(cookieValue)

  if (authenticated) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  const destination =
    request.nextUrl.pathname + request.nextUrl.search
  loginUrl.searchParams.set('redirect', destination)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*', '/snaps/:path*'],
}
