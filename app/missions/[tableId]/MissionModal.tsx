'use client'

import { useEffect, useRef, useState } from 'react'
import { compressImage } from '@/lib/image-compress'
import {
  insertMissionSubmission,
  uploadMissionSubmissionImage,
  uploadMissionSubmissionVideo,
  uploadMissionSubmissionSignatureImage,
  type SubmissionType,
} from '@/lib/mission-submissions'
import {
  missionValidationTypeLabel,
  submissionTypeFromMissionValidation,
  type MissionValidationType,
} from '@/lib/mission-validation-type'
import { SignaturePad } from '@/components/SignaturePad'

export type MissionForModal = {
  id: string
  title: string
  description: string | null
  points: number
  validation_type: MissionValidationType
  target_person_name?: string | null
  submission_hint?: string | null
  header_title?: string | null
  header_image_url?: string | null
  approval_mode?: 'auto' | 'manual'
  allow_multiple_submissions?: boolean
  message_required?: boolean
}

type Props = {
  mission: MissionForModal
  tableId: string
  tableName: string
  tableColor?: string | null
  isPending: boolean
  isCompleted: boolean
  isRejected: boolean
  rejectedNote: string | null
  submittedCount?: number
  existingPhotoUrl: string | null
  missionsEnabled: boolean
  onClose: () => void
  onSuccess: () => void
}

export function MissionModal({
  mission,
  tableId,
  tableName,
  tableColor = null,
  isPending,
  isCompleted,
  isRejected,
  rejectedNote,
  submittedCount = 0,
  existingPhotoUrl,
  missionsEnabled,
  onClose,
  onSuccess,
}: Props) {
  const [pending, setPending] = useState(isPending)
  const [completed, setCompleted] = useState(isCompleted)
  const [rejected, setRejected] = useState(isRejected)
  const [existingUrl, setExistingUrl] = useState<string | null>(existingPhotoUrl)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const signaturePadRef = useRef<{ getBlob: () => Promise<Blob | null>; clear: () => void; isEmpty: () => boolean } | null>(null)

  const submission_type = submissionTypeFromMissionValidation(mission.validation_type) as SubmissionType

  // Keep local UI state in sync when the modal is opened with new props.
  // After a successful submission, avoid clobbering the preview with stale parent props.
  useEffect(() => {
    if (!submitting && !success) {
      setPending(isPending)
      setCompleted(isCompleted)
      setRejected(isRejected)
      setExistingUrl(existingPhotoUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, isCompleted, isRejected, existingPhotoUrl])

  const canSubmit =
    missionsEnabled &&
    !submitting &&
    !pending &&
    !completed &&
    (submission_type !== 'photo' || !!file) &&
    (submission_type !== 'video' || !!videoFile) &&
    (submission_type !== 'signature' || hasSignature) &&
    (!mission.message_required || messageText.trim().length > 0)

  const isRepeatableAuto =
    mission.allow_multiple_submissions === true && mission.approval_mode === 'auto'

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function clearVideo() {
    setVideoFile(null)
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setSubmitError(null)
    setSuccess(false)

    try {
      let submission_data: Record<string, unknown> | undefined

      let submittedPhotoUrl: string | null = null
      if (submission_type === 'photo') {
        if (!file) throw new Error('Please choose a photo first.')
        const { blob, contentType } = await compressImage(file)
        const imageUrl = await uploadMissionSubmissionImage(blob, contentType)
        submittedPhotoUrl = imageUrl
        submission_data = { image_url: imageUrl, message: messageText.trim() || null }
      } else if (submission_type === 'video') {
        if (!videoFile) throw new Error('Please choose a video first.')
        const videoUrl = await uploadMissionSubmissionVideo(videoFile, videoFile.type)
        submission_data = { video_url: videoUrl }
      } else if (submission_type === 'signature') {
        const blob = signaturePadRef.current ? await signaturePadRef.current.getBlob() : null
        if (!blob) throw new Error('Please draw your signature first.')
        const signatureImageUrl = await uploadMissionSubmissionSignatureImage(blob)
        submission_data = { signature_image_url: signatureImageUrl }
      }

      const result = await insertMissionSubmission({
        table_id: tableId,
        mission_id: mission.id,
        submission_type,
        submission_data,
      })

      setSuccess(true)
      if (isRepeatableAuto && result.autoApproved) {
        setPending(false)
        setCompleted(false)
        setRejected(false)
      } else {
        setPending(true)
        setCompleted(false)
        setRejected(false)
      }
      if (submittedPhotoUrl) setExistingUrl(submittedPhotoUrl)
      clearFile()
      clearVideo()
      signaturePadRef.current?.clear()
      setHasSignature(false)
      setMessageText('')
      onSuccess()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const statusText = completed
    ? 'Completed'
    : pending
      ? 'Pending approval'
      : rejected
        ? 'Rejected'
      : isRepeatableAuto
        ? `Submitted ${submittedCount} time${submittedCount === 1 ? '' : 's'}`
        : 'Available'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-modal-title"
    >
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: image if set, else placeholder */}
        {mission.header_image_url ? (
          <div className="h-32 rounded-t-2xl overflow-hidden bg-zinc-800/80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mission.header_image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="h-32 rounded-t-2xl bg-zinc-800/80 flex items-center justify-center">
            <span className="text-sm text-white/50">Mission</span>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="mission-modal-title" className="text-lg font-semibold text-white">
                {mission.header_title?.trim() || mission.title}
              </h2>
              {tableName ? (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/85">
                  <span
                    className="h-2 w-2 rounded-full border border-white/20"
                    style={{ backgroundColor: tableColor || '#71717a' }}
                    aria-hidden
                  />
                  <span>Table {tableName}</span>
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-white">{mission.points} pts</div>
              <div className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/80">
                {missionValidationTypeLabel(mission.validation_type)}
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs text-white/70 line-clamp-3">
            {mission.description ?? 'No description.'}
          </p>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-white/50">Status</span>
            <span className="text-sm font-medium text-white">{statusText}</span>
          </div>

          {missionsEnabled === false ? (
            <>
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
                Missions are opening soon.
              </div>
              <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-zinc-600 py-2.5 text-sm font-medium text-white/90">Close</button>
            </>
          ) : completed ? (
            <>
              <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                <div className="text-sm font-semibold text-emerald-200">Completed</div>
                <div className="mt-1 text-xs text-emerald-100/80">Admin confirmed this mission.</div>
              </div>
              <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-zinc-600 py-2.5 text-sm font-medium text-white/90">Close</button>
            </>
          ) : pending ? (
            <>
              <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                <div className="text-sm font-semibold text-amber-200">
                  {success ? 'Submission received!' : 'Awaiting approval'}
                </div>
                {existingUrl ? (
                  <div className="mt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={existingUrl}
                      alt=""
                      className="max-h-40 w-full rounded border border-amber-200/20 object-contain"
                    />
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 w-full rounded-xl border border-zinc-600 py-2.5 text-sm font-medium text-white/90"
              >
                Close
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {rejected ? (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3">
                  <div className="text-sm font-semibold text-red-200">Rejected</div>
                  {rejectedNote ? (
                    <p className="mt-1 text-xs text-red-100/80">
                      Note: {rejectedNote}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-red-100/80">
                      Your submission was rejected.
                    </p>
                  )}
                  {existingUrl ? (
                    <div className="mt-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={existingUrl}
                        alt=""
                        className="max-h-40 w-full rounded border border-red-200/20 object-contain"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {submission_type === 'photo' && (
                <div className="rounded-xl border border-zinc-800 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">Photo proof</div>
                  <p className="mt-1 text-xs text-white/70">
                    Upload a photo. {mission.message_required ? 'Message is required.' : 'Message is optional.'}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    disabled={!missionsEnabled || submitting}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setFile(f)
                      if (previewUrl) URL.revokeObjectURL(previewUrl)
                      setPreviewUrl(f ? URL.createObjectURL(f) : null)
                      setSubmitError(null)
                    }}
                    className="mt-2 block w-full text-xs text-white/70 file:mr-2 file:rounded file:border file:border-white/10 file:bg-white/5 file:px-2 file:py-1.5"
                  />
                  {previewUrl && (
                    <div className="mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="" className="max-h-40 w-full rounded border border-zinc-700 object-contain" />
                    </div>
                  )}
                  <input
                    type="text"
                    required={mission.message_required === true}
                    placeholder={
                      mission.message_required
                        ? 'Message (required)'
                        : 'Optional message (e.g. for greetings)'
                    }
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="mt-2 w-full rounded border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-white/40"
                  />
                </div>
              )}

              {submission_type === 'video' && (
                <div className="rounded-xl border border-zinc-800 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">Video upload</div>
                  <p className="mt-1 text-xs text-white/70">Upload a video for admin review.</p>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm"
                    disabled={!missionsEnabled || submitting}
                    onChange={(e) => {
                      setVideoFile(e.target.files?.[0] ?? null)
                      setSubmitError(null)
                    }}
                    className="mt-2 block w-full text-xs text-white/70 file:mr-2 file:rounded file:border file:border-white/10 file:bg-white/5 file:px-2 file:py-1.5"
                  />
                  {videoFile && (
                    <p className="mt-2 text-xs text-white/60">{videoFile.name}</p>
                  )}
                  {mission.message_required ? (
                    <input
                      type="text"
                      required
                      placeholder="Message (required)"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className="mt-2 w-full rounded border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-white/40"
                    />
                  ) : null}
                </div>
              )}

              {submission_type === 'signature' && (
                <div className="rounded-xl border border-zinc-800 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">Signature</div>
                  {mission.target_person_name ? (
                    <p className="mt-1 text-xs text-white/90">
                      Sign for: <span className="font-medium">{mission.target_person_name}</span>
                    </p>
                  ) : null}
                  {mission.submission_hint ? (
                    <p className="mt-1 text-xs text-white/70">{mission.submission_hint}</p>
                  ) : (
                    <p className="mt-1 text-xs text-white/70">Draw your signature below.</p>
                  )}
                  <div className="mt-3">
                    <SignaturePad
                      padRef={signaturePadRef as React.RefObject<{ getBlob: () => Promise<Blob | null>; clear: () => void; isEmpty: () => boolean } | null>}
                      onStrokeEnd={() => setHasSignature(true)}
                      disabled={!missionsEnabled || submitting}
                      height={180}
                    />
                  </div>
                  {mission.message_required ? (
                    <input
                      type="text"
                      required
                      placeholder="Message (required)"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className="mt-2 w-full rounded border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-white/40"
                    />
                  ) : null}
                </div>
              )}

              {submitError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {submitError}
                </div>
              )}

              {success && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Submission received. Awaiting approval.
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-zinc-600 px-4 py-3 text-sm font-medium text-white/90"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white border border-white/10 disabled:opacity-40"
                >
                  {submitting ? 'Submitting…' : rejected ? 'Try again' : 'Submit'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>

      <button
        type="button"
        className="absolute inset-0 -z-10"
        aria-label="Close modal"
        onClick={onClose}
      />
    </div>
  )
}
