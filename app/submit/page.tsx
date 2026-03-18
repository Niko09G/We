'use client'

import { useEffect, useRef, useState } from 'react'
import { compressImage } from '@/lib/image-compress'
import {
  listTablesForSubmit,
  listActiveMissionsForSubmit,
  uploadMissionSubmissionImage,
  insertMissionSubmission,
  type SubmitTable,
  type SubmitMission,
} from '@/lib/mission-submissions'
import {
  missionValidationTypeLabel,
  submissionTypeFromMissionValidation,
} from '@/lib/mission-validation-type'

const ACCEPT_IMAGES = 'image/jpeg,image/jpg,image/png,image/webp'
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function isAcceptedImageFile(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type)
}

export default function SubmitPage() {
  const [tables, setTables] = useState<SubmitTable[]>([])
  const [missions, setMissions] = useState<SubmitMission[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [tableId, setTableId] = useState('')
  const [missionId, setMissionId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [t, m] = await Promise.all([
          listTablesForSubmit(),
          listActiveMissionsForSubmit(),
        ])
        if (!cancelled) {
          setTables(t)
          setMissions(m)
          setLoadError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load form.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0]
    if (!chosen) return
    if (!isAcceptedImageFile(chosen)) {
      setSubmitError('Please choose a JPG, PNG, or WebP image.')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(chosen)
    setPreviewUrl(URL.createObjectURL(chosen))
    setSubmitError(null)
    setSuccess(false)
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setSuccess(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /** Clears selections + photo after success (does not clear success banner). */
  function resetFormAfterSuccess() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setTableId('')
    setMissionId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tableId || !missionId || submitting) return

    setSubmitting(true)
    setSubmitError(null)
    setSuccess(false)

    try {
      const mission = missions.find((m) => m.id === missionId)
      const submission_type = submissionTypeFromMissionValidation(mission?.validation_type)

      let submission_data: Record<string, unknown> | undefined
      if (submission_type === 'photo') {
        let imageUrl: string | null = null
        if (file) {
          const { blob, contentType } = await compressImage(file)
          imageUrl = await uploadMissionSubmissionImage(blob, contentType)
        }
        submission_data = imageUrl != null ? { image_url: imageUrl } : undefined
      } else if (submission_type === 'signature') {
        // Future: signature capture payload; for now empty pending review
        submission_data = undefined
      } else {
        submission_data = undefined
      }

      await insertMissionSubmission({
        table_id: tableId,
        mission_id: missionId,
        submission_type,
        submission_data,
      })

      setSuccess(true)
      resetFormAfterSuccess()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = Boolean(
    tableId && missionId && !submitting && !loadError && !success
  )

  const selectedMission = missions.find((m) => m.id === missionId)
  const validationType = selectedMission?.validation_type ?? 'manual'

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900">Submit mission attempt</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Choose your table and mission. Your submission stays pending until an admin approves it.
      </p>

      {loadError && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="table" className="block text-sm font-medium text-zinc-700">
            Table
          </label>
          <select
            id="table"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={tableId}
            onChange={(e) => {
              setTableId(e.target.value)
              setSuccess(false)
            }}
            disabled={!!loadError || tables.length === 0}
          >
            <option value="">Select table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="mission" className="block text-sm font-medium text-zinc-700">
            Mission
          </label>
          <select
            id="mission"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={missionId}
            onChange={(e) => {
              const nextId = e.target.value
              const next = missions.find((m) => m.id === nextId)
              if (next && next.validation_type !== 'photo') clearFile()
              setMissionId(nextId)
              setSuccess(false)
            }}
            disabled={!!loadError || missions.length === 0}
          >
            <option value="">Select mission…</option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          {missions.length === 0 && !loadError && (
            <p className="mt-1 text-xs text-zinc-500">No missions available yet.</p>
          )}
          {selectedMission && (
            <p className="mt-1.5 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600">
              <span className="font-medium text-zinc-800">
                {missionValidationTypeLabel(validationType)}
              </span>
              {validationType === 'photo' && (
                <> — upload a photo if you have one; an admin will verify.</>
              )}
              {validationType === 'signature' && (
                <> — submit to request review (signature confirmation coming later).</>
              )}
              {validationType === 'manual' && (
                <> — an admin will confirm your table completed this mission.</>
              )}
            </p>
          )}
        </div>

        {validationType === 'photo' && (
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              Photo (optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_IMAGES}
              onChange={handleFileChange}
              className="mt-1 block w-full text-sm text-zinc-600"
              disabled={submitting}
            />
            {previewUrl && (
              <div className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-40 rounded border border-zinc-200 object-contain"
                />
                <button
                  type="button"
                  onClick={clearFile}
                  className="mt-1 text-sm text-zinc-600 underline"
                >
                  Remove image
                </button>
              </div>
            )}
          </div>
        )}

        {submitError && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {submitError}
          </p>
        )}

        {success && (
          <p
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            role="status"
            aria-live="polite"
          >
            Submission received! Awaiting approval.
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={submitting}
          className="w-full rounded bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : success ? 'Submitted' : 'Submit'}
        </button>
      </form>
    </main>
  )
}
