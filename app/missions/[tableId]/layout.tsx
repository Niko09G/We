import type { Metadata } from 'next'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveTeamId } from '@/lib/table-teams'

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ tableId: string }>
}

export const revalidate = 0

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { tableId } = await params

  if (!tableId) return { title: 'Team' }

  try {
    const supabase = createServerSupabaseClient()
    const { data: tableRow } = await supabase
      .from('tables')
      .select('team_id')
      .eq('id', tableId)
      .maybeSingle()

    const teamId = resolveTeamId({
      id: tableId,
      team_id: (tableRow as { team_id?: string | null } | null)?.team_id ?? null,
    })

    const { data: teamRow } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .maybeSingle()

    const name = typeof teamRow?.name === 'string' ? teamRow.name.trim() : ''
    return { title: name || 'Team' }
  } catch {
    return { title: 'Team' }
  }
}

export default function TeamHudLayout({ children }: { children: React.ReactNode }) {
  return children
}
