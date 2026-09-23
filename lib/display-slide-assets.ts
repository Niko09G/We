import { v4 as uuidv4 } from 'uuid'

import { supabase } from '@/lib/supabase/client'

const DISPLAY_BUCKET = 'display-slides'
const FALLBACK_PUBLIC_BUCKET = 'greetings'
const PREFIX = 'presenters'

const bucketReachableCache = new Map<string, boolean>()

function storagePathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  const path = publicUrl.slice(idx + marker.length).split('?')[0]
  return path || null
}

function isMissingBucketError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('not found') ||
    m.includes('does not exist') ||
    (m.includes('bucket') && m.includes('invalid'))
  )
}

async function isStorageBucketReachable(bucket: string): Promise<boolean> {
  const cached = bucketReachableCache.get(bucket)
  if (cached !== undefined) return cached

  const { error } = await supabase.storage.from(bucket).list('', { limit: 1 })
  if (!error) {
    bucketReachableCache.set(bucket, true)
    return true
  }

  if (isMissingBucketError(error.message)) {
    bucketReachableCache.set(bucket, false)
    return false
  }

  // List may fail for policy reasons even when uploads work — still try upload.
  bucketReachableCache.set(bucket, true)
  return true
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to encode image preview.'))
    }
    reader.onerror = () => reject(new Error('Failed to encode image preview.'))
    reader.readAsDataURL(blob)
  })
}

async function uploadToBucket(
  bucket: string,
  blob: Blob,
  contentType: string
): Promise<string> {
  const path = `${PREFIX}/${uuidv4()}.webp`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType, upsert: false })

  if (uploadError) {
    throw new Error(uploadError.message || 'Upload failed.')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path)
  return publicUrl
}

/**
 * Upload presenter avatar to storage when a bucket is available, otherwise fall back
 * to an inline data URL so slide creation is never blocked by storage setup issues.
 */
export async function resolvePresenterImageUrl(
  blob: Blob,
  contentType: string
): Promise<string> {
  if (contentType !== 'image/webp') {
    throw new Error('Presenter image upload expects WebP content.')
  }

  for (const bucket of [DISPLAY_BUCKET, FALLBACK_PUBLIC_BUCKET]) {
    if (!(await isStorageBucketReachable(bucket))) continue
    try {
      return await uploadToBucket(bucket, blob, contentType)
    } catch {
      /* try next bucket or inline fallback */
    }
  }

  return blobToDataUrl(blob)
}

/** @deprecated Prefer `resolvePresenterImageUrl` for graceful storage fallbacks. */
export async function uploadPresenterImage(
  blob: Blob,
  contentType: string
): Promise<string> {
  return resolvePresenterImageUrl(blob, contentType)
}

export async function removePresenterImageByUrl(
  publicUrl: string | null | undefined
): Promise<void> {
  const url = typeof publicUrl === 'string' ? publicUrl.trim() : ''
  if (!url || url.startsWith('data:')) return

  for (const bucket of [DISPLAY_BUCKET, FALLBACK_PUBLIC_BUCKET]) {
    const path = storagePathFromPublicUrl(url, bucket)
    if (!path) continue
    await supabase.storage.from(bucket).remove([path])
  }
}
