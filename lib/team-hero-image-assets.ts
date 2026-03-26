import { supabase } from '@/lib/supabase/client'

const BUCKET = 'mission-submissions'
const PREFIX = 'team-hero-images'

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

function sanitizeBaseName(raw: string): string {
  const s = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'team'
}

async function listHeroFileNames(): Promise<Set<string>> {
  const out = new Set<string>()
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(PREFIX, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(error.message || 'Failed to inspect hero image names.')
    const items = data ?? []
    for (const item of items) {
      if (typeof item.name === 'string' && item.name.trim()) out.add(item.name.trim())
    }
    if (items.length < 100) break
    offset += 100
  }
  return out
}

function nextAvailableName(base: string, existing: Set<string>, ext: 'jpg' | 'png' | 'webp'): string {
  const first = `${base}.${ext}`
  if (!existing.has(first)) return first
  let n = 2
  while (existing.has(`${base}-${n}.${ext}`)) n += 1
  return `${base}-${n}.${ext}`
}

function extForContentType(contentType: string): 'jpg' | 'png' | 'webp' {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return 'jpg'
}

export async function uploadTeamHeroImage(file: File, tableName: string): Promise<string> {
  const contentType = file.type
  if (
    contentType !== 'image/jpeg' &&
    contentType !== 'image/jpg' &&
    contentType !== 'image/png' &&
    contentType !== 'image/webp'
  ) {
    throw new Error('Hero image must be JPG, PNG, or WEBP.')
  }

  const base = sanitizeBaseName(tableName)
  const ext = extForContentType(contentType)
  const existing = await listHeroFileNames()
  const filename = nextAvailableName(base, existing, ext)
  const path = `${PREFIX}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false })
  if (uploadError) throw new Error(uploadError.message || 'Hero image upload failed.')

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

export async function removeTeamHeroImageByPublicUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url) return
  const path = storagePathFromPublicUrl(url)
  if (!path) return
  if (!path.startsWith(`${PREFIX}/`)) return
  await supabase.storage.from(BUCKET).remove([path])
}

