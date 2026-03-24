'use client'

import { useState, useRef, useEffect } from 'react'
import { compressImage } from '@/lib/image-compress'
import {
  insertGreeting,
  removeGreetingImageByUrl,
  uploadGreetingImage,
} from '@/lib/upload-greeting'

const MAX_MESSAGE_LENGTH = 120
const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15MB
const ACCEPT_IMAGES = 'image/jpeg,image/jpg,image/png,image/webp'
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function isAcceptedImageFile(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type)
}

export default function UploadPage() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (uploadSuccess) {
      successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [uploadSuccess])

  const canSubmit =
    file !== null &&
    message.trim().length > 0 &&
    !uploading
  const messageLength = message.length

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0]
    if (!chosen) return

    if (!isAcceptedImageFile(chosen)) {
      setFileError('Please choose a JPG, PNG, or WebP image.')
      return
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setFileError('Image must be 15MB or smaller.')
      return
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(chosen)
    setPreviewUrl(URL.createObjectURL(chosen))
    setFileError(null)
    setUploadSuccess(false)
    setUploadError(null)
  }

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setFileError(null)
    setUploadSuccess(false)
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !message.trim() || uploading) return

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(false)

    let uploadedImageUrl: string | null = null
    try {
      const { blob, contentType } = await compressImage(file)
      const imageUrl = await uploadGreetingImage(blob, contentType)
      uploadedImageUrl = imageUrl
      await insertGreeting({
        name: name.trim() || null,
        message: message.trim(),
        image_url: imageUrl,
        status: 'ready',
      })
      setName('')
      setMessage('')
      clearImage()
      setUploadError(null)
      setUploadSuccess(true)
    } catch (err) {
      await removeGreetingImageByUrl(uploadedImageUrl)
      setUploadError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 text-center mb-6">
          Send a greeting
        </h1>

        {uploadSuccess && (
          <div
            ref={successRef}
            className="mb-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 text-emerald-800 dark:text-emerald-200 text-center"
            role="alert"
          >
            Your greeting has been submitted.
          </div>
        )}

        {uploadError && (
          <div
            className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-4 text-red-800 dark:text-red-200 text-center"
            role="alert"
          >
            {uploadError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Name (optional)
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setUploadSuccess(false)
              }}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              htmlFor="message"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
                setUploadSuccess(false)
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={3}
              required
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500 resize-none"
              placeholder="Write your greeting…"
            />
            <p className="mt-1 text-right text-sm text-zinc-500 dark:text-zinc-400">
              {messageLength}/{MAX_MESSAGE_LENGTH}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Photo
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_IMAGES}
              onChange={handleFileChange}
              className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-200 dark:file:bg-zinc-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-900 dark:file:text-zinc-100"
            />
            {fileError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                {fileError}
              </p>
            )}
            {previewUrl && (
              <div className="mt-3">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-48 rounded-lg object-contain border border-zinc-200 dark:border-zinc-700"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Remove photo
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
          >
            {uploading ? 'Uploading…' : 'Send greeting'}
          </button>
        </form>
      </div>
    </div>
  )
}
