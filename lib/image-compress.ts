/**
 * Browser-side image compression before Supabase Storage upload.
 * All raster uploads are converted to WebP with aggressive compression and usage-based max dimensions.
 */

export const WEBP_UPLOAD_QUALITY = 0.68
const WEBP_QUALITY = WEBP_UPLOAD_QUALITY
const ICON_MAX_DIMENSION = 256
const HERO_MAX_DIMENSION = 500
const PHOTO_MAX_DIMENSION = 1080

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export function isAcceptedImageType(type: string): boolean {
  return ACCEPTED_TYPES.includes(type)
}

export function isAcceptedImageFile(file: File): boolean {
  return isAcceptedImageType(file.type)
}

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15MB

export function assertMaxFileSize(file: File): void {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image must be 15MB or smaller.')
  }
}

export interface CompressResult {
  blob: Blob
  contentType: 'image/webp'
}

export type AvatarCompressResult = CompressResult

function scaledDimensionsMaxSide(
  naturalWidth: number,
  naturalHeight: number,
  maxDimension: number
): { width: number; height: number } {
  const maxSide = Math.max(naturalWidth, naturalHeight)
  if (maxSide <= maxDimension) {
    return { width: naturalWidth, height: naturalHeight }
  }
  const scale = maxDimension / maxSide
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

async function compressToWebp(file: File, maxDimension: number): Promise<CompressResult> {
  assertMaxFileSize(file)
  if (!isAcceptedImageFile(file)) {
    throw new Error('Invalid image type. Use JPG, PNG, or WebP.')
  }

  const img = await loadImage(file)
  const { width, height } = scaledDimensionsMaxSide(
    img.naturalWidth,
    img.naturalHeight,
    maxDimension
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context.')
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY)
  return { blob, contentType: 'image/webp' }
}

/** Rank emblems, reward-unit icons, mission header icons — max 256px. */
export async function compressIconImage(file: File): Promise<CompressResult> {
  return compressToWebp(file, ICON_MAX_DIMENSION)
}

/** Team avatars and hero images — max 500px. */
export async function compressHeroImage(file: File): Promise<CompressResult> {
  return compressToWebp(file, HERO_MAX_DIMENSION)
}

/** Greeting and photo mission uploads — max 1080px. */
export async function compressPhotoImage(file: File): Promise<CompressResult> {
  return compressToWebp(file, PHOTO_MAX_DIMENSION)
}

/** @deprecated Use `compressPhotoImage` — kept for existing call sites. */
export async function compressImage(file: File): Promise<CompressResult> {
  return compressPhotoImage(file)
}

/** Avatar-specific transform: resize to max 500px and encode as WebP. */
export async function compressAvatarImage(file: File): Promise<AvatarCompressResult> {
  return compressHeroImage(file)
}

/** Avatar transform with centered square crop, max 500px, encoded as WebP. */
export async function compressAvatarSquareImage(file: File): Promise<AvatarCompressResult> {
  assertMaxFileSize(file)
  if (!isAcceptedImageFile(file)) {
    throw new Error('Invalid image type. Use JPG, PNG, or WebP.')
  }

  const img = await loadImage(file)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const srcX = Math.floor((img.naturalWidth - side) / 2)
  const srcY = Math.floor((img.naturalHeight - side) / 2)
  const outSide = Math.min(HERO_MAX_DIMENSION, side)

  const canvas = document.createElement('canvas')
  canvas.width = outSide
  canvas.height = outSide
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context.')
  ctx.drawImage(img, srcX, srcY, side, side, 0, 0, outSide, outSide)

  const blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY)
  return { blob, contentType: 'image/webp' }
}

export function webpUploadFile(blob: Blob, baseName: string): File {
  const safe = baseName.replace(/\.[^.]+$/, '').trim() || 'image'
  return new File([blob], `${safe}.webp`, { type: 'image/webp' })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image.'))
    }
    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode image.'))),
      type,
      quality
    )
  })
}
