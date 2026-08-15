import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'

const BUCKET = 'mission-submissions'
const PREFIX = 'guest-emblems'

function extForContentType(contentType: string): 'webp' {
  if (contentType !== 'image/webp') {
    throw new Error('Emblem upload expects WebP content.')
  }
  return 'webp'
}

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

export async function uploadGuestEmblem(file: File): Promise<string> {
  const contentType = file.type
  if (contentType !== 'image/webp') {
    throw new Error('Please upload a WebP image.')
  }
  const path = `${PREFIX}/${uuidv4()}.${extForContentType(contentType)}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false })
  if (uploadError) throw new Error(uploadError.message || 'Emblem upload failed.')

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

export async function removeGuestEmblemByPublicUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path || !path.startsWith(`${PREFIX}/`)) return
  await supabase.storage.from(BUCKET).remove([path])
}
