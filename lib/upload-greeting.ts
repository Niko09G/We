import { v4 as uuidv4 } from 'uuid'

import { supabase } from '@/lib/supabase/client'

const BUCKET = 'greetings'

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/greetings/'
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

export type GreetingInsert = {
  name: string | null
  message: string
  image_url: string
  status: 'ready'
  source_type?: 'upload' | 'mission'
  table_id?: string | null
  table_name?: string | null
  table_color?: string | null
}

/**
 * Upload compressed image to Supabase Storage and return public URL.
 */
export async function uploadGreetingImage(
  blob: Blob,
  contentType: string
): Promise<string> {
  const ext = contentType === 'image/png' ? 'png' : 'jpg'
  const path = `${uuidv4()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: false })

  if (uploadError) {
    throw new Error(uploadError.message || 'Upload failed.')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

/**
 * Insert a greeting row into the database.
 */
export async function insertGreeting(row: GreetingInsert): Promise<void> {
  const { error } = await supabase.from('greetings').insert({
    name: row.name || null,
    message: row.message,
    image_url: row.image_url,
    status: row.status,
    source_type: row.source_type ?? 'upload',
    table_id: row.table_id ?? null,
    table_name: row.table_name ?? null,
    table_color: row.table_color ?? null,
  })

  if (error) {
    throw new Error(error.message || 'Failed to save greeting.')
  }
}

/** Best-effort cleanup when greeting DB insert fails after upload succeeded. */
export async function removeGreetingImageByUrl(publicUrl: string | null | undefined): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}
