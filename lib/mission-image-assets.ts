import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'

const BUCKET = 'mission-submissions'
const PREFIX = 'mission-images'

function extForContentType(contentType: string): 'jpg' | 'png' | 'webp' {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return 'jpg'
}

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

export async function uploadMissionImageAsset(file: File): Promise<string> {
  const contentType = file.type
  if (
    contentType !== 'image/jpeg' &&
    contentType !== 'image/jpg' &&
    contentType !== 'image/png' &&
    contentType !== 'image/webp'
  ) {
    throw new Error('Mission image must be JPG, PNG, or WEBP.')
  }
  const path = `${PREFIX}/${uuidv4()}.${extForContentType(contentType)}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false })
  if (uploadError) throw new Error(uploadError.message || 'Mission image upload failed.')

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

export async function removeMissionImageAssetByPublicUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path || !path.startsWith(`${PREFIX}/`)) return
  await supabase.storage.from(BUCKET).remove([path])
}
