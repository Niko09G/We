'use client'

import { useEffect, useState } from 'react'
import { claimUrlToQrPngDataUrl, downloadClaimQrPng, qrDownloadFilename } from '@/lib/token-qr'
import { copyTextWithFallback } from '@/lib/copy-text'

type Props = {
  open: boolean
  onClose: () => void
  claimUrl: string
  tokenId: string
  tokenPreview: string
}

export default function TokenQrPreviewModal({
  open,
  onClose,
  claimUrl,
  tokenId,
  tokenPreview,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      setDataUrl(null)
      setError(null)
      setCopied(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setDataUrl(null)

    void (async () => {
      try {
        const png = await claimUrlToQrPngDataUrl(claimUrl)
        if (!cancelled) setDataUrl(png)
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Could not generate QR.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, claimUrl])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-preview-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="qr-preview-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              QR preview
            </h2>
            <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">{tokenPreview}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-4">
          {loading && (
            <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-600">
              Generating…
            </div>
          )}
          {error && (
            <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {dataUrl && !error && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL from local QR lib
            <img
              src={dataUrl}
              alt="QR code for claim URL"
              width={256}
              height={256}
              className="h-64 w-64 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700"
            />
          )}

          <p className="w-full break-all rounded bg-zinc-100 px-2 py-1.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {claimUrl}
          </p>

          <div className="flex w-full flex-wrap gap-2">
            <button
              type="button"
              disabled={!dataUrl || !!error}
              onClick={() => void downloadClaimQrPng(claimUrl, qrDownloadFilename(tokenId))}
              className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Download PNG
            </button>
            <button
              type="button"
              onClick={() => void copyTextWithFallback(claimUrl).then((ok) => {
                setCopied(ok)
                if (ok) window.setTimeout(() => setCopied(false), 2000)
              })}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
            >
              {copied ? 'Copied URL' : 'Copy URL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
