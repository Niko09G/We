/**
 * Browser-side image compression for greeting uploads.
 * Resizes to max width 1600px, targets JPEG (or PNG when transparency needed), ~0.75–0.82 quality.
 */

const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.8
const PNG_QUALITY = 0.82
const TARGET_MAX_BYTES = 1_000_000 // 1MB

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

function hasTransparency(file: File): boolean {
  return file.type === 'image/png' || file.type === 'image/webp'
}

export interface CompressResult {
  blob: Blob
  contentType: string
}

/**
 * Compress image in the browser: max width 1600, preserve aspect ratio,
 * JPEG (or PNG if transparency). Quality ~0.75–0.82. Aim under 1MB.
 */
export async function compressImage(file: File): Promise<CompressResult> {
  assertMaxFileSize(file)
  if (!isAcceptedImageFile(file)) {
    throw new Error('Invalid image type. Use JPG, PNG, or WebP.')
  }

  const keepAlpha = hasTransparency(file)
  const contentType = keepAlpha ? 'image/png' : 'image/jpeg'
  const quality = keepAlpha ? PNG_QUALITY : JPEG_QUALITY

  const img = await loadImage(file)
  const { width, height } = scaledDimensions(img.naturalWidth, img.naturalHeight, MAX_WIDTH)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context.')

  ctx.drawImage(img, 0, 0, width, height)

  let blob: Blob
  if (keepAlpha) {
    blob = await canvasToBlob(canvas, 'image/png', PNG_QUALITY)
  } else {
    blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  }

  // If still over 1MB, recompress at lower quality (JPEG only)
  if (!keepAlpha && blob.size > TARGET_MAX_BYTES) {
    const img2 = await loadImageFromBlob(blob)
    const c2 = document.createElement('canvas')
    c2.width = width
    c2.height = height
    const ctx2 = c2.getContext('2d')
    if (ctx2) {
      ctx2.drawImage(img2, 0, 0, width, height)
      blob = await canvasToBlob(c2, 'image/jpeg', 0.72)
    }
  }

  return { blob, contentType }
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

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
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

function scaledDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number
): { width: number; height: number } {
  if (naturalWidth <= maxWidth) {
    return { width: naturalWidth, height: naturalHeight }
  }
  const scale = maxWidth / naturalWidth
  return {
    width: maxWidth,
    height: Math.round(naturalHeight * scale),
  }
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
