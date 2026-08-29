import { redirect } from 'next/navigation'
import { normalizeClaimTokenInput } from '@/lib/admin-tokens'

export const dynamic = 'force-dynamic'

export default async function ClaimQueryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const sp = await searchParams
  const token = normalizeClaimTokenInput(sp.token ?? '')
  if (!token) {
    redirect('/missions')
  }
  redirect(`/claim/${encodeURIComponent(token)}`)
}
