import { parseClaimRouteToken } from '@/lib/admin-tokens'
import ClaimBeatcoinClient from './ClaimBeatcoinClient'

export const dynamic = 'force-dynamic'

export default async function ClaimBeatcoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }> | { token: string }
  searchParams: Promise<{ token?: string }> | { token?: string }
}) {
  const resolvedParams = await params
  const sp = await searchParams
  const token = parseClaimRouteToken(resolvedParams.token, sp.token)

  return <ClaimBeatcoinClient token={token} />
}
