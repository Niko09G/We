import { supabase } from '@/lib/supabase/client'

const BUCKET = 'greetings'

export type GreetingRow = {
  id: string
  name: string | null
  message: string
  image_url: string
  status: string
  created_at: string
  source_type?: 'upload' | 'mission'
  table_id?: string | null
  table_name?: string | null
  table_color?: string | null
  /** Big-screen rotation stats (optional until migration applied). */
  display_count?: number
  last_displayed_at?: string | null
}

export async function listGreetings(): Promise<GreetingRow[]> {
  const { data, error } = await supabase
    .from('greetings')
    .select('id,name,message,image_url,status,created_at,source_type,table_id,table_name,table_color')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load greetings.')
  return (data ?? []) as GreetingRow[]
}

const DISPLAY_SELECT =
  'id,name,message,image_url,status,created_at,source_type,table_id,table_name,table_color,display_count,last_displayed_at'

/**
 * Big screen only: next ready greeting by fair rotation — fewest `display_count`,
 * then newest `created_at` (new items surface quickly among ties; older rows still get turns).
 */
export async function fetchNextFairGreetingForDisplay(
  limit = 1
): Promise<GreetingRow[]> {
  const lim = Math.min(100, Math.max(1, Math.floor(limit)))
  const { data, error } = await supabase
    .from('greetings')
    .select(DISPLAY_SELECT)
    .eq('status', 'ready')
    .order('display_count', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(lim)

  if (error) throw new Error(error.message || 'Failed to load greetings.')
  return (data ?? []) as GreetingRow[]
}

/** After a greeting was shown on the big screen for one slot; increments display_count. */
export async function recordGreetingDisplayed(greetingId: string): Promise<void> {
  const { error } = await supabase.rpc('record_greeting_displayed', {
    p_id: greetingId,
  })
  if (error) throw new Error(error.message || 'Failed to record greeting display.')
}

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/greetings/'
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

/**
 * Deletes the greeting row. Best-effort deletes the image from storage first.
 * If storage deletion fails, the row is still deleted and a storageWarning is returned.
 */
export async function deleteGreeting(
  row: Pick<GreetingRow, 'id' | 'image_url'>
): Promise<{ storageWarning?: string }> {
  let storageWarning: string | undefined
  const path = storagePathFromPublicUrl(row.image_url)

  if (path) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([path])
    if (storageError) {
      storageWarning = 'Image could not be removed from storage (row was still deleted).'
    }
  } else {
    storageWarning = 'Could not determine storage path; row was still deleted.'
  }

  const { error: dbError } = await supabase.from('greetings').delete().eq('id', row.id)
  if (dbError) throw new Error(dbError.message || 'Failed to delete greeting.')

  return storageWarning ? { storageWarning } : {}
}

export async function deleteMissionGeneratedGreetingsBySubmissionId(
  missionSubmissionId: string
): Promise<void> {
  const { error } = await supabase
    .from('greetings')
    .delete()
    .eq('mission_submission_id', missionSubmissionId)
  if (error) throw new Error(error.message || 'Failed to delete greetings.')
}
