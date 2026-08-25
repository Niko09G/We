import { supabase } from '@/lib/supabase/client'
import type { GreetingRow } from '@/lib/greetings-admin'

const SELECT =
  'id,name,message,image_url,status,created_at,source_type,table_id,table_name,table_color'

/**
 * Ready greetings for **mobile / guest** surfaces only: newest first, fixed window (no display_count rotation).
 * Big screen (`/display`) loads the full queue via `fetchDisplayGreetings` in `greetings-admin`.
 */
export async function listReadyGreetingsNewestFirst(
  limit?: number
): Promise<GreetingRow[]> {
  let q = supabase
    .from('greetings')
    .select(SELECT)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })

  if (limit != null && limit > 0) {
    q = q.limit(limit)
  }

  const { data, error } = await q

  if (error) throw new Error(error.message || 'Failed to load greetings.')
  return (data ?? []) as GreetingRow[]
}

/** Paginated window for infinite scroll (newest first). */
export async function listReadyGreetingsPage(
  offset: number,
  limit: number
): Promise<GreetingRow[]> {
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeLimit = Math.min(60, Math.max(1, Math.floor(limit)))
  const { data, error } = await supabase
    .from('greetings')
    .select(SELECT)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)

  if (error) throw new Error(error.message || 'Failed to load greetings.')
  return (data ?? []) as GreetingRow[]
}
