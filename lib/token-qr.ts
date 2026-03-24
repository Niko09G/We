/**
 * Client-side QR generation for token claim URLs (PNG via `qrcode` package — no external APIs).
 */

import QRCode from 'qrcode'

/** Canvas width in CSS pixels; suitable for print at ~1.5–2" at 300dpi when embedded. */
export const TOKEN_QR_PNG_WIDTH = 512

const QR_OPTIONS: Parameters<typeof QRCode.toDataURL>[1] = {
  width: TOKEN_QR_PNG_WIDTH,
  margin: 2,
  errorCorrectionLevel: 'M',
  color: { dark: '#000000', light: '#ffffff' },
  type: 'image/png',
}

/** PNG data URL (`data:image/png;base64,...`) for the given claim URL. */
export async function claimUrlToQrPngDataUrl(claimUrl: string): Promise<string> {
  const url = claimUrl.trim()
  if (!url) throw new Error('Missing claim URL for QR.')
  return QRCode.toDataURL(url, QR_OPTIONS)
}

/** Trigger a browser download of a PNG file (same QR as preview). */
export async function downloadClaimQrPng(claimUrl: string, filename: string): Promise<void> {
  const dataUrl = await claimUrlToQrPngDataUrl(claimUrl)
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'token-qr.png'
  const name = safeName.toLowerCase().endsWith('.png') ? safeName : `${safeName}.png`

  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Short filename segment from token id (uuid). */
export function qrDownloadFilename(tokenId: string): string {
  const short = tokenId.replace(/-/g, '').slice(0, 12)
  return `claim-qr-${short}.png`
}
