'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getMissionsEnabled } from '@/lib/app-settings'
import { compressImage } from '@/lib/image-compress'
import {
  isAcceptedImageType,
  isAcceptedVideoType,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  prettyMb,
} from '@/lib/upload-constraints'
import {
  insertMissionSubmission,
  removeMissionSubmissionUploadByUrl,
  uploadMissionSubmissionImage,
  uploadMissionSubmissionVideo,
  uploadMissionSubmissionSignatureImage,
  type SubmissionType,
} from '@/lib/mission-submissions'
import {
  missionValidationTypeLabel,
  normalizeMissionValidationType,
  submissionTypeFromMissionValidation,
  type MissionValidationType,
} from '@/lib/mission-validation-type'
import { RewardAmount } from '@/components/reward/RewardAmount'
import { SignaturePad } from '@/components/SignaturePad'
import { createClientRequestId } from '@/lib/client-request-id'

type Params = { tableId: string; missionId: string }

type MissionRow = {
  id: string
  title: string
  description: string | null
  points: number
  validation_type: MissionValidationType
  is_active?: boolean
  target_person_name?: string | null
  submission_hint?: string | null
}

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export default function MissionDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { tableId, missionId } = use(params)
  const router = useRouter()

  const [missionsEnabled, setMissionsEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tableName, setTableName] = useState<string>('')
  const [mission, setMission] = useState<MissionRow | null>(null)

  const [pending, setPending] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [textAnswer, setTextAnswer] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const signaturePadRef = useRef<{ getBlob: () => Promise<Blob | null>; clear: () => void; isEmpty: () => boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        if (!isUuid(tableId) || !isUuid(missionId)) {
          setLoading(false)
          setError('Invalid link. Please go back and select again.')
          router.replace('/missions')
          return
        }

        const enabled = await getMissionsEnabled()
        if (cancelled) return
        setMissionsEnabled(enabled)
        if (enabled !== true) {
          setLoading(false)
          return
        }

        const [tRes, mRes, aRes, cRes, pRes] = await Promise.all([
          supabase
            .from('tables')
            .select('name,is_active,is_archived')
            .eq('id', tableId)
            .maybeSingle(),
          supabase
            .from('missions')
            .select('id,title,description,points,validation_type,is_active,target_person_name,submission_hint')
            .eq('id', missionId)
            .maybeSingle(),
          supabase
            .from('mission_assignments')
            .select('id')
            .eq('table_id', tableId)
            .eq('mission_id', missionId)
            .eq('is_active', true)
            .maybeSingle(),
          supabase
            .from('completions')
            .select('mission_id')
            .eq('table_id', tableId)
            .eq('mission_id', missionId),
          supabase
            .from('mission_submissions')
            .select('id,status,submission_data')
            .eq('table_id', tableId)
            .eq('mission_id', missionId)
            .eq('status', 'pending')
            .limit(1),
        ])

        if (tRes.error) throw tRes.error
        if (mRes.error) throw mRes.error
        if (aRes.error) throw aRes.error
        if (cRes.error) throw cRes.error
        if (pRes.error) throw pRes.error

        if ((tRes.data as { is_archived?: boolean } | null)?.is_archived === true) {
          setError('This table has been archived.')
          setLoading(false)
          return
        }

        const tIsActive = (tRes.data as any)?.is_active ?? true
        if (!tIsActive) {
          setError('This table is not active.')
          setLoading(false)
          return
        }

        const assignmentExists = !!aRes.data
        if (!assignmentExists) {
          setError('This mission is not available for this table.')
          setLoading(false)
          return
        }

        setTableName((tRes.data?.name as string | null) ?? '')

        const row = mRes.data
        if (!row) {
          setMission(null)
          setError('Mission not found.')
          setLoading(false)
          return
        }

        if ((row as any).is_active === false) {
          setMission(null)
          setError('This mission is not active.')
          setLoading(false)
          return
        }

        const normalized = normalizeMissionValidationType(
          row.validation_type as string | null | undefined
        )
        const isActive = (row as any).is_active ?? true
        setMission({
          id: row.id as string,
          title: row.title as string,
          description: (row.description as string | null) ?? null,
          points: Number(row.points) || 0,
          validation_type: normalized,
          is_active: isActive,
          target_person_name: (row as Record<string, unknown>).target_person_name as string | null ?? null,
          submission_hint: (row as Record<string, unknown>).submission_hint as string | null ?? null,
        })

        const isCompleted = (cRes.data ?? []).length > 0
        setCompleted(isCompleted)

        if ((pRes.data ?? []).length > 0) {
          setPending(true)
          const row = (pRes.data ?? [])[0] as any
          const data = row.submission_data as any
          const url =
            data && typeof data.image_url === 'string' ? data.image_url : null
          setExistingPhotoUrl(url)
        } else {
          setPending(false)
          setExistingPhotoUrl(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load mission.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tableId, missionId])

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!mission || !tableId || !missionId) return
    if (missionsEnabled !== true) return
    if (submitting) return
    if (pending || completed) return

    setSubmitting(true)
    setSubmitError(null)
    setSuccess(false)
    let uploadedMediaUrl: string | null = null

    try {
      const submission_type = submissionTypeFromMissionValidation(
        mission.validation_type
      )

      let submission_data: Record<string, unknown> | undefined
      let submittedPhotoUrl: string | null = null

      if (submission_type === 'photo') {
        if (!file) throw new Error('Please choose a photo first.')
        const { blob, contentType } = await compressImage(file)
        const imageUrl = await uploadMissionSubmissionImage(blob, contentType)
        submittedPhotoUrl = imageUrl
        uploadedMediaUrl = imageUrl
        submission_data = { image_url: imageUrl }
      } else if (submission_type === 'video') {
        if (!videoFile) throw new Error('Please choose a video first.')
        const videoUrl = await uploadMissionSubmissionVideo(videoFile, videoFile.type)
        uploadedMediaUrl = videoUrl
        submission_data = { video_url: videoUrl }
      } else if (submission_type === 'signature') {
        const blob = signaturePadRef.current ? await signaturePadRef.current.getBlob() : null
        if (!blob) throw new Error('Please draw your signature first.')
        const signatureImageUrl = await uploadMissionSubmissionSignatureImage(blob)
        uploadedMediaUrl = signatureImageUrl
        submission_data = { signature_image_url: signatureImageUrl }
      } else if (submission_type === 'text') {
        const t = textAnswer.trim()
        if (!t) throw new Error('Write a message before submitting.')
        submission_data = { text: t }
      } else {
        submission_data = undefined
      }

      const submitResult = await insertMissionSubmission({
        table_id: tableId,
        mission_id: missionId,
        submission_type: submission_type as SubmissionType,
        submission_data,
        client_request_id: createClientRequestId(),
      })

      setSuccess(true)
      if (submitResult.autoApproved) {
        setPending(false)
        setCompleted(true)
      } else {
        setPending(true)
        setCompleted(false)
      }
      setExistingPhotoUrl(submission_type === 'photo' ? submittedPhotoUrl : null)
      clearFile()
      setTextAnswer('')
    } catch (e) {
      await removeMissionSubmissionUploadByUrl(uploadedMediaUrl)
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const statusText = useMemo(() => {
    if (missionsEnabled === null) return 'Loading…'
    if (missionsEnabled !== true) return 'Opening soon'
    if (completed) return 'Completed'
    if (pending) return 'Pending approval'
    return 'Available'
  }, [missionsEnabled, completed, pending])

  const canSubmit = useMemo(() => {
    if (missionsEnabled !== true || !mission || submitting || pending || completed) return false
    if (mission.validation_type === 'photo') return !!file
    if (mission.validation_type === 'video') return !!videoFile
    if (mission.validation_type === 'signature') return hasSignature
    if (mission.validation_type === 'text') return textAnswer.trim().length > 0
    return false
  }, [
    missionsEnabled,
    mission,
    submitting,
    pending,
    completed,
    file,
    videoFile,
    hasSignature,
    textAnswer,
  ])

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Mission
              </h1>
              {tableName ? (
                <p className="mt-1 text-xs text-white/60">Table: {tableName}</p>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-xs text-white/60">Status</div>
              <div className="text-sm font-semibold text-white">{statusText}</div>
            </div>
          </div>
          <div className="mt-4">
            <Link
              href={`/missions/${tableId}`}
              className="text-xs font-medium text-white/70 underline hover:no-underline"
            >
              Back to missions
            </Link>
          </div>
        </div>

        {missionsEnabled === false ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <div className="text-sm font-semibold text-amber-900">Opening soon</div>
            <div className="mt-1 text-xs text-amber-900/80">
              Missions are paused until the event starts.
            </div>
            <div className="mt-3">
              <Link
                href="/play"
                className="text-xs font-medium text-amber-900 underline hover:no-underline"
              >
                Back to hub
              </Link>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <div className="text-sm font-semibold text-red-800">Error</div>
            <div className="mt-1 text-xs text-red-800/90">{error}</div>
          </div>
        ) : loading || !mission ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[90px] animate-pulse rounded-2xl border border-zinc-800 bg-white/5"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-800 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white">
                    {mission.title}
                  </div>
                  {mission.description != null && mission.description.trim() !== '' ? (
                    <div className="mt-2 text-xs text-white/70 line-clamp-3 whitespace-pre-wrap">
                      {mission.description}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-white">
                    <RewardAmount amount={mission.points} iconSize={16} className="text-white" />
                  </div>
                  <div className="mt-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/80">
                    {missionValidationTypeLabel(mission.validation_type)}
                  </div>
                </div>
              </div>
            </div>

            {pending ? (
              <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                <div className="text-sm font-semibold text-amber-200">
                  {success ? 'Submission received!' : 'Awaiting approval'}
                </div>
                {success ? (
                  <div className="mt-1 text-xs text-amber-100/80">
                    Awaiting approval.
                  </div>
                ) : null}
                {existingPhotoUrl ? (
                  <div className="mt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={existingPhotoUrl}
                      alt=""
                      className="max-h-56 w-full rounded border border-amber-200/20 object-contain"
                    />
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-amber-100/80">
                    Your submission is pending review.
                  </div>
                )}
              </div>
            ) : completed ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                <div className="text-sm font-semibold text-emerald-200">
                  Completed
                </div>
                <div className="mt-2 text-xs text-emerald-100/80">
                  Admin confirmed this mission for your table.
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {mission.validation_type === 'photo' ? (
                  <div className="rounded-2xl border border-zinc-800 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">
                      Photo proof
                    </div>
                    <div className="mt-1 text-xs text-white/70">
                      Upload a clear photo. Admin will review it.
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      JPG/PNG/WebP only, up to {prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.
                    </div>

                    <div className="mt-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        disabled={missionsEnabled !== true || submitting}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          if (f && !isAcceptedImageType(f.type)) {
                            setSubmitError('Please choose a JPG, PNG, or WebP image.')
                            e.currentTarget.value = ''
                            return
                          }
                          if (f && f.size > MAX_IMAGE_UPLOAD_BYTES) {
                            setSubmitError(`Image is too large. Max ${prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.`)
                            e.currentTarget.value = ''
                            return
                          }
                          setFile(f)
                          if (previewUrl) URL.revokeObjectURL(previewUrl)
                          if (f) setPreviewUrl(URL.createObjectURL(f))
                          else setPreviewUrl(null)
                          setSubmitError(null)
                        }}
                        className="block w-full text-xs text-white/70 file:mr-3 file:rounded file:border file:border-white/10 file:bg-white/5 file:px-2 file:py-2"
                      />
                    </div>

                    {previewUrl ? (
                      <div className="mt-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt=""
                          className="max-h-56 w-full rounded border border-zinc-700 object-contain"
                        />
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => clearFile()}
                        className="text-xs font-medium text-white/70 underline hover:no-underline disabled:opacity-50"
                      >
                        Clear photo
                      </button>
                    </div>
                  </div>
                ) : mission.validation_type === 'video' ? (
                  <div className="rounded-2xl border border-zinc-800 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">Video upload</div>
                    <div className="mt-1 text-xs text-white/70">
                      Upload a video for admin review (MP4/WEBM, up to {prettyMb(MAX_VIDEO_UPLOAD_BYTES)}).
                    </div>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/mp4,video/webm"
                      disabled={missionsEnabled !== true || submitting}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        if (f && !isAcceptedVideoType(f.type)) {
                          setSubmitError('Please choose an MP4 or WEBM video.')
                          e.currentTarget.value = ''
                          return
                        }
                        if (f && f.size > MAX_VIDEO_UPLOAD_BYTES) {
                          setSubmitError(`Video is too large. Max ${prettyMb(MAX_VIDEO_UPLOAD_BYTES)}.`)
                          e.currentTarget.value = ''
                          return
                        }
                        setVideoFile(f)
                        setSubmitError(null)
                      }}
                      className="mt-3 block w-full text-xs text-white/70 file:mr-3 file:rounded file:border file:border-white/10 file:bg-white/5 file:px-2 file:py-2"
                    />
                    {videoFile && (
                      <p className="mt-2 text-xs text-white/60">{videoFile.name}</p>
                    )}
                  </div>
                ) : mission.validation_type === 'signature' ? (
                  <div className="rounded-2xl border border-zinc-800 bg-white/5 p-4">
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
                        disabled={missionsEnabled !== true || submitting}
                        height={180}
                      />
                    </div>
                  </div>
                ) : mission.validation_type === 'text' ? (
                  <div className="rounded-2xl border border-zinc-800 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">Your message</div>
                    <textarea
                      value={textAnswer}
                      onChange={(e) => {
                        setTextAnswer(e.target.value)
                        setSubmitError(null)
                      }}
                      rows={5}
                      placeholder="Write a message"
                      disabled={missionsEnabled !== true || submitting}
                      className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20"
                    />
                  </div>
                ) : null}

                {submitError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                    <div className="text-sm font-semibold text-red-800">Error</div>
                    <div className="mt-1 text-xs text-red-800/90">
                      {submitError}
                    </div>
                  </div>
                ) : null}

                {success ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="text-sm font-semibold text-emerald-800">
                      Submission received!
                    </div>
                    <div className="mt-1 text-xs text-emerald-800/90">
                      Awaiting approval.
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="flex-1 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white border border-white/10 disabled:opacity-40"
                  >
                    {submitting ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  )
}

