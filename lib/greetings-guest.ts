import { supabase } from '@/lib/supabase/client'
import type { GreetingRow } from '@/lib/greetings-admin'

const SELECT =
  'id,name,message,image_url,status,created_at,source_type,table_id,table_name,table_color'

/**
 * Ready greetings for guests, newest first.
 * Use a limit for strips; omit limit for full gallery (capped server-side by PostgREST default if needed).
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
