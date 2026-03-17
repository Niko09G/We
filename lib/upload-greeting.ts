import { supabase } from '@/lib/supabase/client'

const BUCKET = 'greetings'

export type GreetingInsert = {
  name: string | null
  message: string
  image_url: string
  status: 'ready'
}

/**
 * Upload compressed image to Supabase Storage and return public URL.
 */
export async function uploadGreetingImage(
  blob: Blob,
  contentType: string
): Promise<string> {
  const ext = contentType === 'image/png' ? 'png' : 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`

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
  })

  if (error) {
    throw new Error(error.message || 'Failed to save greeting.')
  }
}
