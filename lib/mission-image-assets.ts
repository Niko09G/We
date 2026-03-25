import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'

const BUCKET = 'mission-submissions'
const PREFIX = 'mission-images'
const PREFIX_CARD_COVER = 'mission-card-covers'

const UPLOAD_PREFIXES = [PREFIX, PREFIX_CARD_COVER] as const

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

async function uploadToPrefix(
  file: File,
  prefix: typeof PREFIX | typeof PREFIX_CARD_COVER
): Promise<string> {
  const contentType = file.type
  if (
    contentType !== 'image/jpeg' &&
    contentType !== 'image/jpg' &&
    contentType !== 'image/png' &&
    contentType !== 'image/webp'
  ) {
    throw new Error('Mission image must be JPG, PNG, or WEBP.')
  }
  const path = `${prefix}/${uuidv4()}.${extForContentType(contentType)}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false })
  if (uploadError) throw new Error(uploadError.message || 'Mission image upload failed.')

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

export async function uploadMissionImageAsset(file: File): Promise<string> {
  return uploadToPrefix(file, PREFIX)
}

/** Full-bleed mission card artwork (carousel tile). */
export async function uploadMissionCardCoverAsset(file: File): Promise<string> {
  return uploadToPrefix(file, PREFIX_CARD_COVER)
}

export async function removeMissionImageAssetByPublicUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path) return
  const allowed = UPLOAD_PREFIXES.some((p) => path.startsWith(`${p}/`))
  if (!allowed) return
  await supabase.storage.from(BUCKET).remove([path])
}
