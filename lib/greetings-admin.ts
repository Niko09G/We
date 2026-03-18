import { supabase } from '@/lib/supabase/client'

const BUCKET = 'greetings'

export type GreetingRow = {
  id: string
  name: string | null
  message: string
  image_url: string
  status: string
  created_at: string
}

export async function listGreetings(): Promise<GreetingRow[]> {
  const { data, error } = await supabase
    .from('greetings')
    .select('id,name,message,image_url,status,created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load greetings.')
  return (data ?? []) as GreetingRow[]
}

/** For display carousel: ready only, oldest first. */
export async function listReadyGreetingsForDisplay(): Promise<GreetingRow[]> {
  const { data, error } = await supabase
    .from('greetings')
    .select('id,name,message,image_url,status,created_at')
    .eq('status', 'ready')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message || 'Failed to load greetings.')
  return (data ?? []) as GreetingRow[]
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
