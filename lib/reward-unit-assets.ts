import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'

const BUCKET = 'mission-submissions'
const PREFIX = 'reward-unit-icons'

function extForContentType(contentType: string): 'png' | 'webp' {
  return contentType === 'image/png' ? 'png' : 'webp'
}

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

export async function uploadRewardUnitIcon(file: File): Promise<string> {
  const contentType = file.type
  if (contentType !== 'image/png' && contentType !== 'image/webp') {
    throw new Error('Please upload PNG or WEBP.')
  }

  const path = `${PREFIX}/${uuidv4()}.${extForContentType(contentType)}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false })
  if (uploadError) throw new Error(uploadError.message || 'Icon upload failed.')

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

/** Best effort cleanup for replaced/removed icon URLs. */
export async function removeRewardUnitIconByPublicUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path) return
  if (!path.startsWith(`${PREFIX}/`)) return

  await supabase.storage.from(BUCKET).remove([path])
}

