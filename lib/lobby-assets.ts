import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'

const BUCKET = 'mission-submissions'
const HEADER_LOGO_PREFIX = 'lobby-header-logos'
const HERO_BACKGROUND_PREFIX = 'lobby-hero-backgrounds'

function extForContentType(contentType: string): 'webp' {
  if (contentType !== 'image/webp') {
    throw new Error('Lobby image upload expects WebP content.')
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

async function uploadLobbyImage(file: File, prefix: string): Promise<string> {
  const contentType = file.type
  if (contentType !== 'image/webp') {
    throw new Error('Please upload a WebP image.')
  }
  const path = `${prefix}/${uuidv4()}.${extForContentType(contentType)}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false })
  if (uploadError) throw new Error(uploadError.message || 'Lobby image upload failed.')

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

async function removeLobbyImageByPublicUrl(
  publicUrl: string | null | undefined,
  prefix: string
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path || !path.startsWith(`${prefix}/`)) return
  await supabase.storage.from(BUCKET).remove([path])
}

export async function uploadLobbyHeaderLogo(file: File): Promise<string> {
  return uploadLobbyImage(file, HEADER_LOGO_PREFIX)
}

export async function uploadLobbyHeroBackground(file: File): Promise<string> {
  return uploadLobbyImage(file, HERO_BACKGROUND_PREFIX)
}

export async function removeLobbyHeaderLogoByPublicUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  return removeLobbyImageByPublicUrl(publicUrl, HEADER_LOGO_PREFIX)
}

export async function removeLobbyHeroBackgroundByPublicUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  return removeLobbyImageByPublicUrl(publicUrl, HERO_BACKGROUND_PREFIX)
}
