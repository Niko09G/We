import { parseClaimRouteToken } from '@/lib/admin-tokens'
import ClaimBeatcoinClient from './ClaimBeatcoinClient'

export const dynamic = 'force-dynamic'

export default async function ClaimBeatcoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { token: pathToken } = await params
  const { token: queryToken } = await searchParams
  const token = parseClaimRouteToken(pathToken, queryToken)

  return <ClaimBeatcoinClient token={token} />
}
