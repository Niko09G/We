import type { Metadata } from 'next'

import { createServerSupabaseClient } from '@/lib/supabase/server'

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ tableId: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { tableId } = await params
  const fallbackTitle = 'Team'

  if (!tableId) return { title: fallbackTitle }

  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('tables')
      .select('name')
      .eq('id', tableId)
      .maybeSingle()

    const name = typeof data?.name === 'string' ? data.name.trim() : ''
    return { title: name || fallbackTitle }
  } catch {
    return { title: fallbackTitle }
  }
}

export default function TeamHudLayout({ children }: { children: React.ReactNode }) {
  return children
}
