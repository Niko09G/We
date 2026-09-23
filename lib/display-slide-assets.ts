import { v4 as uuidv4 } from 'uuid'

import { supabase } from '@/lib/supabase/client'

const BUCKET = 'display-slides'
const PREFIX = 'presenters'

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

export async function uploadPresenterImage(
  blob: Blob,
  contentType: string
): Promise<string> {
  if (contentType !== 'image/webp') {
    throw new Error('Presenter image upload expects WebP content.')
  }
  const path = `${PREFIX}/${uuidv4()}.webp`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false })

  if (uploadError) {
    throw new Error(uploadError.message || 'Upload failed.')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

export async function removePresenterImageByUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}
