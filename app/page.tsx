import { LobbyPageClient } from '@/app/LobbyPageClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function LobbyPage() {
  return <LobbyPageClient />
}
