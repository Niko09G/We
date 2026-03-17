import { supabase } from '@/lib/supabase/client'

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

function storagePathFromPublicUrl(publicUrl: string): string | null {
  // Expected: https://<ref>.supabase.co/storage/v1/object/public/greetings/<path>
  const marker = '/storage/v1/object/public/greetings/'
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length)
  if (!path) return null
  // Strip query string if present
  return path.split('?')[0] ?? null
}

/**
 * Deletes the greeting row. Best-effort deletes the storage object too (if policies allow it).
 * Returns a warning message if the storage deletion fails but DB deletion succeeds.
 */
export async function deleteGreeting(
  row: Pick<GreetingRow, 'id' | 'image_url'>
): Promise<{ storageWarning?: string }> {
  const storagePath = storagePathFromPublicUrl(row.image_url)
  let storageWarning: string | undefined

  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from('greetings')
      .remove([storagePath])

    if (storageError) {
      storageWarning =
        'Deleted from the database, but could not delete the image from storage (check Storage delete policies).'
    }
  } else {
    storageWarning =
      'Deleted from the database, but could not determine the storage path from image_url.'
  }

  const { error: dbError } = await supabase.from('greetings').delete().eq('id', row.id)
  if (dbError) throw new Error(dbError.message || 'Failed to delete greeting.')

  return storageWarning ? { storageWarning } : {}
}

