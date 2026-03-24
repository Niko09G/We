export const IMAGE_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const

export const VIDEO_ACCEPTED_MIME_TYPES = ['video/mp4', 'video/webm'] as const

export const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024 // 12MB
export const MAX_VIDEO_UPLOAD_BYTES = 40 * 1024 * 1024 // 40MB
export const MAX_ICON_UPLOAD_BYTES = 2 * 1024 * 1024 // 2MB

export function isAcceptedImageType(type: string): boolean {
  return IMAGE_ACCEPTED_MIME_TYPES.includes(type as (typeof IMAGE_ACCEPTED_MIME_TYPES)[number])
}

export function isAcceptedVideoType(type: string): boolean {
  return VIDEO_ACCEPTED_MIME_TYPES.includes(type as (typeof VIDEO_ACCEPTED_MIME_TYPES)[number])
}

export function prettyMb(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`
}

