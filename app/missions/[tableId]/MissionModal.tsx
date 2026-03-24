'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  effectiveMaxSubmissionsPerTable,
  isRepeatableAutoMission,
} from '@/lib/mission-limits'
import {
  normalizeMissionValidationType,
  submissionTypeFromMissionValidation,
  type MissionValidationType,
} from '@/lib/mission-validation-type'
import { SignaturePad } from '@/components/SignaturePad'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { rewardUnitAnimationAltIconUrls } from '@/lib/reward-unit'
import { createClientRequestId } from '@/lib/client-request-id'
import {
  DEFAULT_GUEST_MISSION_HUD_EMBLEMS,
  GUEST_EMBLEM_PLACEHOLDER_DATA_URL,
  type GuestMissionHudEmblems,
} from '@/lib/guest-emblem-config'

type RewardFlightCoin = {
  id: string
  iconUrl: string
  startX: number
  startY: number
  endX: number
  endY: number
  rotateDeg: number
  scaleStart: number
  scaleEnd: number
  curveY: number
  delayMs: number
}

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
  max_submissions_per_table?: number | null
  message_required?: boolean
}

/** Team standing + mission reward coins (guest overlay HUD). */
export type MissionRewardHud = {
  /** Displayed as coin balance (🪙); same source as table points for now. */
  teamPoints: number
  /** 1-based rank, or null if not on leaderboard yet. */
  rank: number | null
  totalTeams: number
  missionRewardPoints: number
  /** True when this mission’s reward could move the team up at least one place (vs team directly above). */
  missionCouldReachNextRank: boolean
  /** Leaderboard position above the team’s current rank (e.g. rank 5 → next target 4). Null if N/A. */
  nextRankTarget: number | null
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
  /** Pending + approved rows for this table/mission (rejected excluded). */
  submissionSlotsUsed?: number
  atSubmissionLimit?: boolean
  existingPhotoUrl: string | null
  missionsEnabled: boolean
  missionGradient: string
  onPrev?: () => void
  onNext?: () => void
  onClose: () => void
  onSuccess: () => void
  rewardHud?: MissionRewardHud
  /** Optional emblem URLs; placeholders when null (see `guest_emblems` app_settings, future). */
  hudEmblems?: Partial<GuestMissionHudEmblems>
  resetSignal?: number
  /** Hero CTA = blur-only + white chrome; mission cards = blur + light tint + black title. */
  overlayVariant?: 'hero-greeting' | 'missions-section'
}

export function MissionModal({
  mission,
  tableId,
  tableName,
  tableColor: _tableColor = null,
  isPending,
  isCompleted,
  isRejected,
  rejectedNote: _rejectedNote,
  submissionSlotsUsed = 0,
  atSubmissionLimit = false,
  existingPhotoUrl: _existingPhotoUrl,
  missionsEnabled,
  missionGradient,
  onPrev,
  onNext,
  onClose,
  onSuccess,
  rewardHud,
  hudEmblems: hudEmblemsProp,
  resetSignal = 0,
  overlayVariant = 'missions-section',
}: Props) {
  const { config: rewardUnit } = useRewardUnit()
  const hudEmblems: GuestMissionHudEmblems = {
    ...DEFAULT_GUEST_MISSION_HUD_EMBLEMS,
    ...hudEmblemsProp,
  }
  const existingPhotoUrl = _existingPhotoUrl ?? null
  void _tableColor
  const [pending, setPending] = useState(isPending)
  const [completed, setCompleted] = useState(isCompleted)
  const [rejected, setRejected] = useState(isRejected)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  /** Photo / video capture → confirm flow */
  const [photoStep, setPhotoStep] = useState<1 | 2>(1)
  const [videoStep, setVideoStep] = useState<1 | 2>(1)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  /** Show pen+line cue until first touch or after clear. */
  const [signatureCueVisible, setSignatureCueVisible] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [rewardFlights, setRewardFlights] = useState<RewardFlightCoin[]>([])
  const [rewardFlightActive, setRewardFlightActive] = useState(false)
  const [rewardAbsorbing, setRewardAbsorbing] = useState(false)
  const [rewardCounterValue, setRewardCounterValue] = useState<number | null>(null)
  const [rewardClaimedText, setRewardClaimedText] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const claimRewardBtnRef = useRef<HTMLButtonElement>(null)
  const signaturePadRef = useRef<{ getBlob: () => Promise<Blob | null>; clear: () => void; isEmpty: () => boolean } | null>(null)
  const lastResetApplied = useRef(0)
  /** Future: animate earned coins into this counter after submission. */
  const missionOverlayCoinCountRef = useRef<HTMLSpanElement>(null)
  /** Future: animate reward line on earn. */
  const missionOverlayRewardHeadlineRef = useRef<HTMLParagraphElement>(null)
  const rewardHudBadgeRef = useRef<HTMLSpanElement>(null)
  const missionOverlayCoinCountValueRef = useRef<HTMLSpanElement>(null)

  const REWARD_ICON_SIZE_PX = 24
  const MAX_REWARD_FLIGHT_COINS = 5

  const normalizedVt = normalizeMissionValidationType(mission.validation_type)
  const isBeatcoinMission = normalizedVt === 'beatcoin'
  const submission_type = (
    isBeatcoinMission ? 'text' : submissionTypeFromMissionValidation(mission.validation_type)
  ) as SubmissionType

  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  useEffect(() => {
    if (resetSignal <= lastResetApplied.current) return
    lastResetApplied.current = resetSignal
    setFile(null)
    setPreviewUrl(null)
    setPhotoStep(1)
    setVideoStep(1)
    setVideoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setVideoFile(null)
    setMessageText('')
    setHasSignature(false)
    setSignatureCueVisible(true)
    setSubmitError(null)
    setSuccess(false)
    setRewardFlights([])
    setRewardFlightActive(false)
    setRewardAbsorbing(false)
    setRewardCounterValue(null)
    setRewardClaimedText(null)
    signaturePadRef.current?.clear()
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (videoInputRef.current) videoInputRef.current.value = ''
  }, [resetSignal])

  /** Clear draft when switching missions (no pre-filled content from prior mission). */
  useEffect(() => {
    setMessageText('')
    setFile(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPhotoStep(1)
    setVideoStep(1)
    setVideoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setVideoFile(null)
    setHasSignature(false)
    setSignatureCueVisible(true)
    setSubmitError(null)
    setSuccess(false)
    setRewardFlights([])
    setRewardFlightActive(false)
    setRewardAbsorbing(false)
    setRewardCounterValue(null)
    setRewardClaimedText(null)
    signaturePadRef.current?.clear()
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (videoInputRef.current) videoInputRef.current.value = ''
  }, [mission.id])

  // Keep local UI state in sync when the modal is opened with new props.
  // After a successful submission, avoid clobbering the preview with stale parent props.
  useEffect(() => {
    if (!submitting && !success) {
      setPending(isPending)
      setCompleted(isCompleted)
      setRejected(isRejected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, isCompleted, isRejected])

  const messageOk =
    submission_type === 'text'
      ? messageText.trim().length > 0
      : !mission.message_required || messageText.trim().length > 0

  const canSubmit =
    missionsEnabled &&
    !submitting &&
    !pending &&
    !completed &&
    !atSubmissionLimit &&
    !isBeatcoinMission &&
    messageOk &&
    (submission_type !== 'photo' || (!!file && photoStep === 2)) &&
    (submission_type !== 'video' || (!!videoFile && videoStep === 2)) &&
    (submission_type !== 'signature' || hasSignature)

  const isRepeatableAuto = isRepeatableAutoMission({
    approval_mode: mission.approval_mode ?? 'manual',
    max_submissions_per_table: mission.max_submissions_per_table,
    allow_multiple_submissions: mission.allow_multiple_submissions,
  })

  const maxSubmissionsCap = effectiveMaxSubmissionsPerTable({
    max_submissions_per_table: mission.max_submissions_per_table,
    allow_multiple_submissions: mission.allow_multiple_submissions,
  })

  const isHeroOverlay = overlayVariant === 'hero-greeting'
  const isMissionsSection = overlayVariant === 'missions-section'

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setPhotoStep(1)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function clearVideo() {
    setVideoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setVideoFile(null)
    setVideoStep(1)
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setSubmitError(null)
    setSuccess(false)
    let uploadedMediaUrl: string | null = null

    try {
      let submission_data: Record<string, unknown> | undefined

      if (submission_type === 'photo') {
        if (!file) throw new Error('Please choose a photo first.')
        const { blob, contentType } = await compressImage(file)
        const imageUrl = await uploadMissionSubmissionImage(blob, contentType)
        uploadedMediaUrl = imageUrl
        submission_data = { image_url: imageUrl, message: messageText.trim() || null }
      } else if (submission_type === 'video') {
        if (!videoFile) throw new Error('Please choose a video first.')
        const videoUrl = await uploadMissionSubmissionVideo(videoFile, videoFile.type)
        uploadedMediaUrl = videoUrl
        submission_data = {
          video_url: videoUrl,
          message: messageText.trim() || null,
        }
      } else if (submission_type === 'signature') {
        const blob = signaturePadRef.current ? await signaturePadRef.current.getBlob() : null
        if (!blob) throw new Error('Please draw your signature first.')
        const signatureImageUrl = await uploadMissionSubmissionSignatureImage(blob)
        uploadedMediaUrl = signatureImageUrl
        submission_data = {
          signature_image_url: signatureImageUrl,
          message: messageText.trim() || null,
        }
      } else if (submission_type === 'text') {
        const t = messageText.trim()
        if (!t) throw new Error('Write a message before submitting.')
        submission_data = { text: t }
      }

      const result = await insertMissionSubmission({
        table_id: tableId,
        mission_id: mission.id,
        submission_type,
        submission_data,
        client_request_id: createClientRequestId(),
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
      clearFile()
      clearVideo()
      signaturePadRef.current?.clear()
      setHasSignature(false)
      setSignatureCueVisible(true)
      setMessageText('')
      onSuccess()
    } catch (e) {
      await removeMissionSubmissionUploadByUrl(uploadedMediaUrl)
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const backdropClass = isHeroOverlay
    ? 'absolute inset-0 bg-transparent backdrop-blur-xl [background-color:transparent]'
    : 'absolute inset-0 bg-white/40 backdrop-blur-md'

  /** Stats row on gradient HUD (always light text on category gradient). */
  const hudGradientStatsClass =
    'text-[0.9rem] font-bold tabular-nums tracking-tight text-white sm:text-[1rem]'

  const arrowClass = isHeroOverlay
    ? 'fixed left-[max(0.5rem,env(safe-area-inset-left))] top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/95 text-lg font-medium text-zinc-900 transition hover:bg-white active:scale-[0.98] sm:left-3 sm:h-12 sm:w-12'
    : 'fixed left-[max(0.5rem,env(safe-area-inset-left))] top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-lg font-medium text-zinc-900 transition hover:bg-zinc-50 active:scale-[0.98] sm:left-3 sm:h-12 sm:w-12'

  const arrowClassRight = isHeroOverlay
    ? 'fixed right-[max(0.5rem,env(safe-area-inset-right))] top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/95 text-lg font-medium text-zinc-900 transition hover:bg-white active:scale-[0.98] sm:right-3 sm:h-12 sm:w-12'
    : 'fixed right-[max(0.5rem,env(safe-area-inset-right))] top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-lg font-medium text-zinc-900 transition hover:bg-zinc-50 active:scale-[0.98] sm:right-3 sm:h-12 sm:w-12'

  const cardMaxClass = isMissionsSection
    ? 'w-full max-w-[min(100vw-1rem,30rem)]'
    : 'w-full max-w-[min(min(100vw,calc(88vw*1.1)),24.2rem)]'

  const closeClusterLabelClass = isHeroOverlay
    ? 'text-xs font-medium text-white/85'
    : 'text-sm font-medium text-black'

  const closeCircleBtnClass = isHeroOverlay
    ? 'flex h-11 w-11 items-center justify-center rounded-full border border-white/45 bg-white/12 text-2xl font-light leading-none text-white backdrop-blur-sm transition hover:bg-white/22 active:scale-[0.98]'
    : 'inline-flex h-11 w-11 items-center justify-center rounded-full bg-black text-2xl font-normal leading-none text-white transition hover:bg-zinc-800 active:scale-[0.98]'

  const scrollPadClass = isMissionsSection
    ? 'flex min-h-0 flex-1 flex-col items-stretch justify-start overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(1.35rem,calc(env(safe-area-inset-top)+1rem))] sm:px-6'
    : 'flex min-h-0 flex-1 flex-col items-stretch justify-start overflow-y-auto overflow-x-hidden overscroll-contain px-14 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-0 sm:px-16'

  const cardBodyScrollClass =
    'min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pl-[10px] pr-3 pb-6 pt-2 sm:pr-4 sm:pb-8 sm:pt-2.5'
  const cardCtaBarClass =
    'shrink-0 border-t border-zinc-100/80 bg-white px-3 pb-[max(1.1rem,calc(env(safe-area-inset-bottom)+0.55rem))] pt-3.5 sm:px-4'

  /** Primary action pinned to bottom of card while content scrolls (guest flows). */
  const cardStickyCtaClass =
    'sticky bottom-0 z-10 mt-5 -mx-3 border-t border-zinc-100/80 bg-white px-3 pb-[max(1.1rem,calc(env(safe-area-inset-bottom)+0.55rem))] pt-3.5 sm:-mx-4 sm:px-4'

  const inActiveMissionForm =
    missionsEnabled && !completed && !pending && !atSubmissionLimit
  const isPhotoTwoStep =
    submission_type === 'photo' && inActiveMissionForm && !isBeatcoinMission
  const isVideoTwoStep =
    submission_type === 'video' && inActiveMissionForm && !isBeatcoinMission
  const showStandardMissionHeader = !isPhotoTwoStep && !isVideoTwoStep

  const missionTitleText = mission.header_title?.trim() || mission.title
  const missionDescOneLine = (mission.description ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const missionArtworkUrl = mission.header_image_url?.trim() || null
  const circularImageSrc =
    previewUrl ||
    videoPreviewUrl ||
    existingPhotoUrl ||
    missionArtworkUrl ||
    GUEST_EMBLEM_PLACEHOLDER_DATA_URL
  const animationAltIcons = useMemo(
    () => rewardUnitAnimationAltIconUrls(rewardUnit),
    [rewardUnit]
  )
  const displayedTeamPoints = rewardCounterValue ?? rewardHud?.teamPoints ?? 0

  const attemptsIndicatorText =
    maxSubmissionsCap == null
      ? 'Unlimited'
      : maxSubmissionsCap > 0
        ? `${Math.min(submissionSlotsUsed, maxSubmissionsCap)} / ${maxSubmissionsCap} attempts`
        : 'Unlimited'
  const isUnlimitedMission = maxSubmissionsCap == null
  const isCompletedCappedMission = completed && !isUnlimitedMission
  const isPendingState = pending && !success
  const isLimitState = atSubmissionLimit && !completed

  async function runRewardClaimAnimation() {
    if (!rewardHud) return
    if (rewardFlightActive || rewardAbsorbing) return
    const from = claimRewardBtnRef.current?.getBoundingClientRect()
    const to = missionOverlayCoinCountRef.current?.getBoundingClientRect()
    if (!from || !to || animationAltIcons.length === 0) {
      const target = rewardHud.teamPoints + rewardHud.missionRewardPoints
      setRewardCounterValue(target)
      setRewardClaimedText(
        maxSubmissionsCap == null
          ? 'Mission Completed'
          : `Attempt ${Math.min(submissionSlotsUsed + 1, maxSubmissionsCap)} / ${maxSubmissionsCap} completed`
      )
      return
    }

    const coinCount = Math.min(MAX_REWARD_FLIGHT_COINS, animationAltIcons.length)
    const startX = from.left + from.width / 2
    const startY = from.top + from.height / 2
    const endX = to.left + to.width / 2
    const endY = to.top + to.height / 2

    const coins: RewardFlightCoin[] = Array.from({ length: coinCount }, (_, i) => ({
      id: `${Date.now()}-${i}`,
      iconUrl: animationAltIcons[i % animationAltIcons.length]!,
      startX,
      startY,
      endX,
      endY,
      rotateDeg: Math.round((Math.random() - 0.5) * 36),
      scaleStart: 0.94 + Math.random() * 0.2,
      scaleEnd: 0.6 + Math.random() * 0.1,
      curveY: -24 - Math.random() * 24,
      delayMs: i * 45,
    }))

    setRewardFlights(coins)
    setRewardFlightActive(true)
    window.requestAnimationFrame(() => setRewardAbsorbing(true))

    const base = rewardHud.teamPoints
    const gain = rewardHud.missionRewardPoints
    const counterDurationMs = 520
    const startMs = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - startMs) / counterDurationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setRewardCounterValue(Math.round(base + gain * eased))
      if (t < 1) window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)

    window.setTimeout(() => {
      const hudEl = rewardHudBadgeRef.current
      if (hudEl?.animate) {
        hudEl.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.08)' },
            { transform: 'scale(0.98)' },
            { transform: 'scale(1)' },
          ],
          { duration: 280, easing: 'ease-out' }
        )
      }
    }, 470)

    window.setTimeout(() => {
      setRewardFlights([])
      setRewardFlightActive(false)
      setRewardAbsorbing(false)
      setRewardCounterValue(base + gain)
      setRewardClaimedText(
        maxSubmissionsCap == null
          ? 'Mission Completed'
          : `Attempt ${Math.min(submissionSlotsUsed + 1, maxSubmissionsCap)} / ${maxSubmissionsCap} completed`
      )
    }, 760)
  }

  function handleBackdropDismiss(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  function renderPrimaryCta(defaultLabel: string) {
    if (success && rewardHud) {
      if (rewardClaimedText) {
        return (
          <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-[0.92rem] font-medium text-emerald-800">
            {rewardClaimedText}
          </div>
        )
      }
      return (
        <button
          ref={claimRewardBtnRef}
          type="button"
          onClick={() => void runRewardClaimAnimation()}
          disabled={rewardFlightActive}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-3.5 text-[0.95rem] font-semibold text-white disabled:opacity-55 active:scale-[0.99] hover:bg-zinc-800"
        >
          {rewardFlightActive ? 'Claiming…' : `Claim +${rewardHud.missionRewardPoints}`}
          <RewardUnitIcon size={REWARD_ICON_SIZE_PX} />
        </button>
      )
    }
    return (
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-xl bg-zinc-900 py-3.5 text-[0.95rem] font-semibold text-white disabled:opacity-40 active:scale-[0.99] hover:bg-zinc-800"
      >
        {submitting ? 'Submitting…' : defaultLabel}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] min-h-[100dvh] overflow-hidden overscroll-none">
      <div
        className={`absolute inset-0 z-0 ${backdropClass}`}
        aria-hidden
        onClick={handleBackdropDismiss}
      />
      <div
        className="relative z-10 flex h-full min-h-0 flex-col pointer-events-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          rewardHud && tableName ? 'mission-overlay-team-name' : 'mission-modal-title'
        }
      >
        {isHeroOverlay && onPrev ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPrev()
            }}
            className={`${arrowClass} pointer-events-auto`}
            aria-label="Previous mission"
          >
            ‹
          </button>
        ) : null}
        {isHeroOverlay && onNext ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNext()
            }}
            className={`${arrowClassRight} pointer-events-auto`}
            aria-label="Next mission"
          >
            ›
          </button>
        ) : null}

        <div
          className={`${scrollPadClass} pointer-events-auto`}
          onClick={handleBackdropDismiss}
        >
          <div
            className={`relative mx-auto flex w-full max-h-[min(96dvh,calc(100dvh-1.5rem))] min-h-0 shrink-0 flex-col overflow-hidden rounded-3xl border border-zinc-200/80 bg-white ${cardMaxClass}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {rewardHud ? (
                <div
                  className="relative shrink-0 overflow-hidden rounded-t-3xl px-4 pb-4 pt-4 sm:px-5 sm:pb-[1.15rem] sm:pt-5"
                  style={{ background: missionGradient }}
                >
                  <div className="flex items-stretch gap-3.5 sm:gap-4">
                    <div className="flex shrink-0 flex-col justify-center">
                      <div
                        className="relative h-[5.35rem] w-[4.6rem] overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/35 sm:h-[5.6rem] sm:w-[4.85rem]"
                        data-mission-overlay-emblem-slot
                        aria-hidden
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- rank emblem with placeholder fallback */}
                        <img
                          src={
                            hudEmblems.rankEmblemUrl?.trim() ||
                            GUEST_EMBLEM_PLACEHOLDER_DATA_URL
                          }
                          alt=""
                          className="h-full w-full object-contain p-1"
                        />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 text-left">
                      <p
                        id="mission-overlay-team-name"
                        className="text-[1.06rem] font-bold leading-snug tracking-tight text-white sm:text-[1.12rem]"
                      >
                        {tableName.trim() || 'Your table'}
                      </p>
                      <div
                        className="flex flex-nowrap items-center gap-x-3.5"
                        role="group"
                        aria-label="Team rank, balance, and mission reward"
                        data-mission-overlay-hud
                      >
                        <span
                          className={`inline-flex items-center gap-0.5 leading-none ${hudGradientStatsClass}`}
                          data-mission-overlay-rank
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- rank emblem placeholder / configured asset */}
                          <img
                            src={
                              hudEmblems.rankEmblemUrl?.trim() ||
                              GUEST_EMBLEM_PLACEHOLDER_DATA_URL
                            }
                            alt=""
                            className="mr-0.5 inline-block h-6 w-6 rounded object-contain opacity-90"
                          />
                          {rewardHud.totalTeams > 0 ? (
                            rewardHud.rank != null ? (
                              <>
                                <span className="tabular-nums leading-none">
                                  #{rewardHud.rank}
                                </span>
                                <span className="text-[0.72rem] font-medium tabular-nums leading-none opacity-55 sm:text-[0.78rem]">
                                  {' '}
                                  / {rewardHud.totalTeams}
                                </span>
                              </>
                            ) : (
                              <>
                                <span>—</span>
                                <span className="text-[0.72rem] font-medium tabular-nums opacity-55 sm:text-[0.78rem]">
                                  {' '}
                                  / {rewardHud.totalTeams}
                                </span>
                              </>
                            )
                          ) : (
                            <span>—</span>
                          )}
                        </span>
                        <span
                          ref={(el) => {
                            missionOverlayCoinCountRef.current = el
                            rewardHudBadgeRef.current = el
                          }}
                          id="mission-overlay-coin-count"
                          className={`inline-flex items-center gap-1 leading-none ${hudGradientStatsClass}`}
                          data-mission-overlay-coin-count
                        >
                          <RewardUnitIcon size={REWARD_ICON_SIZE_PX} />
                          <span ref={missionOverlayCoinCountValueRef}>{displayedTeamPoints}</span>
                        </span>
                        {!completed ? (
                          <span
                            ref={missionOverlayRewardHeadlineRef}
                            data-mission-overlay-reward-headline
                            className={`inline-flex items-center tabular-nums leading-none text-emerald-400/85 ${hudGradientStatsClass}`}
                          >
                            <span data-mission-overlay-reward-amount>
                              (+{rewardHud.missionRewardPoints})
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : mission.header_image_url ? (
                <div
                  className="relative h-[calc(7rem*1.1)] shrink-0 overflow-hidden rounded-t-3xl sm:h-[calc(7.5rem*1.1)]"
                  style={{ background: missionGradient }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mission.header_image_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="relative h-[calc(7rem*1.1)] shrink-0 overflow-hidden rounded-t-3xl sm:h-[calc(7.5rem*1.1)]"
                  style={{ background: missionGradient }}
                />
              )}

              {rewardHud ? (
                <div className="relative shrink-0 bg-white px-4 pb-3 pt-3.5 sm:px-5 sm:pb-3.5 sm:pt-4">
                  {isCompletedCappedMission ? (
                    <div
                      className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[0.9rem] font-medium text-emerald-800"
                      data-mission-overlay-announcement
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span aria-hidden>✓</span>
                        <span className="truncate">Mission completed</span>
                        <span aria-hidden>·</span>
                        <span>+{rewardHud.missionRewardPoints}</span>
                        <RewardUnitIcon size={REWARD_ICON_SIZE_PX} />
                      </span>
                      <span className="text-right text-[0.78rem] font-medium tracking-tight text-emerald-800/80 sm:text-[0.82rem]">
                        {attemptsIndicatorText}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="grid grid-cols-[1fr_auto] items-center gap-3 text-[0.85rem] font-normal text-zinc-700 sm:text-[0.9rem]"
                      data-mission-overlay-announcement
                    >
                      <div className="inline-flex min-w-0 items-center gap-1.5">
                        {isPendingState ? (
                          <span className="truncate font-medium text-amber-800">Pending review</span>
                        ) : isLimitState ? (
                          <span className="truncate font-medium text-zinc-700">Mission completed</span>
                        ) : (
                          <>
                            <span className="truncate">
                              This mission grants{' '}
                              <span className="font-semibold text-[#6231fb]">
                                +{rewardHud.missionRewardPoints}
                              </span>
                            </span>
                            <RewardUnitIcon size={REWARD_ICON_SIZE_PX} />
                          </>
                        )}
                      </div>
                      <span className="text-right text-[0.78rem] font-medium tracking-tight text-zinc-600 sm:text-[0.82rem]">
                        {attemptsIndicatorText}
                      </span>
                    </div>
                  )}
                  <div
                    className="pointer-events-none absolute bottom-0 left-3 right-3 h-px sm:left-5 sm:right-5"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(161,161,170,0.75) 35%, rgba(161,161,170,0.75) 65%, transparent)',
                    }}
                  />
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  className={`${cardBodyScrollClass} font-sans text-[0.9rem] font-normal leading-relaxed sm:pt-2 ${
                    isPhotoTwoStep || isVideoTwoStep ? 'flex min-h-0 flex-col' : ''
                  }`}
                >
                {showStandardMissionHeader ? (
                  <>
                    <div className="mt-3 flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element -- mission artwork / uploaded preview */}
                      <img
                        src={circularImageSrc}
                        alt=""
                        className="h-[80px] w-[80px] rounded-full border border-zinc-200/90 object-cover"
                      />
                    </div>
                    <h2
                      id="mission-modal-title"
                      className="px-5 pt-4 text-center text-[1.2rem] font-semibold leading-snug text-zinc-900 sm:px-7 sm:pt-5"
                    >
                      {missionTitleText}
                    </h2>
                    <p className="mt-3.5 px-5 break-words text-center text-[0.9rem] font-normal leading-relaxed text-zinc-600 sm:px-7">
                      {mission.description ?? 'No description.'}
                    </p>
                  </>
                ) : null}

          {missionsEnabled === false ? (
            <>
              <div className="mt-4 text-center text-zinc-700">
                Missions are opening soon.
              </div>
            </>
          ) : completed || pending || atSubmissionLimit ? null : isBeatcoinMission && inActiveMissionForm ? (
            <>
              <p className="mt-6 text-center text-[0.95rem] leading-relaxed text-zinc-600">
                Scan the QR on each physical {rewardUnit.name} to add to your team balance. Each
                code can only be claimed once — open your camera on the coin, or use the link from
                your host.
              </p>
              <div className={cardStickyCtaClass}>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-zinc-900 py-3.5 text-[0.95rem] font-semibold text-white active:scale-[0.99] hover:bg-zinc-800"
                >
                  Got it
                </button>
              </div>
            </>
          ) : (
            <>
              {isPhotoTwoStep && (
                <input
                  id="mission-photo-file"
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  disabled={!missionsEnabled || submitting}
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
                    setPreviewUrl(f ? URL.createObjectURL(f) : null)
                    setSubmitError(null)
                    if (f) setPhotoStep(2)
                    else setPhotoStep(1)
                  }}
                  className="sr-only"
                  tabIndex={-1}
                />
              )}

              {isVideoTwoStep && (
                <input
                  id="mission-video-file"
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm"
                  disabled={!missionsEnabled || submitting}
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
                    setVideoPreviewUrl((prev) => {
                      if (prev) URL.revokeObjectURL(prev)
                      return f ? URL.createObjectURL(f) : null
                    })
                    setSubmitError(null)
                    if (f) setVideoStep(2)
                    else setVideoStep(1)
                  }}
                  className="sr-only"
                  tabIndex={-1}
                />
              )}

              {isPhotoTwoStep && photoStep === 1 && (
                <div className="motion-safe:animate-[missionStepIn_0.28s_ease-out_both] flex min-h-[12rem] flex-1 flex-col items-center justify-start text-center">
                  <div className="w-full px-3 pt-7">
                    <h2
                      id="mission-modal-title"
                      className="text-center text-[1.17rem] font-semibold leading-snug text-zinc-900"
                    >
                      {missionTitleText}
                    </h2>
                    <p className="mt-3 max-w-[20rem] break-words text-center text-[0.9rem] font-normal leading-relaxed text-zinc-600">
                      {missionDescOneLine || '\u00A0'}
                    </p>
                  </div>
                  <div className={cardStickyCtaClass}>
                    <div
                      className="mx-auto mb-2 h-px w-full max-w-[18rem]"
                      style={{
                        background:
                          'linear-gradient(to right, transparent, rgba(161,161,170,0.7), transparent)',
                      }}
                    />
                    <p className="mb-2 text-center text-[0.78rem] font-normal italic leading-relaxed text-zinc-500">
                      JPG/PNG/WebP only, up to {prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.
                    </p>
                    <label
                      htmlFor="mission-photo-file"
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[0.95rem] font-semibold text-white transition active:scale-[0.99] hover:brightness-110 disabled:opacity-50"
                      style={{ backgroundColor: '#6231fb' }}
                    >
                      <span aria-hidden>📸</span>
                      <span>Choose photo</span>
                    </label>
                  </div>
                </div>
              )}

              {isPhotoTwoStep && photoStep === 2 && (
                <form
                  onSubmit={handleSubmit}
                  className="motion-safe:animate-[missionStepIn_0.28s_ease-out_both] flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-6 pt-3 sm:pb-8">
                    <h2 className="text-center text-[1.17rem] font-semibold leading-snug text-zinc-900">
                      {missionTitleText}
                    </h2>
                    {previewUrl ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="relative mx-auto block h-[70px] w-[70px] overflow-hidden rounded-full border border-zinc-200/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a53fa]/40"
                        aria-label="Change photo"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-black/15 pb-1 text-[0.66rem] font-medium leading-tight text-white">
                          Change
                        </span>
                      </button>
                    ) : null}
                    <label htmlFor="mission-msg-photo" className="sr-only">
                      Message
                    </label>
                    <input
                      id="mission-msg-photo"
                      type="text"
                      required={mission.message_required === true}
                      placeholder="Write a message"
                      value={messageText}
                      onChange={(e) => {
                        setMessageText(e.target.value)
                        setSubmitError(null)
                      }}
                      disabled={!missionsEnabled || submitting}
                      autoComplete="off"
                      className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-[#4a53fa]/30"
                    />
                    {submitError ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {submitError}
                      </div>
                    ) : null}
                    {success ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Submission received. Awaiting approval.
                      </div>
                    ) : null}
                  </div>
                  <div className={cardStickyCtaClass}>
                    {renderPrimaryCta('Publish')}
                  </div>
                </form>
              )}

              {isVideoTwoStep && videoStep === 1 && (
                <div className="motion-safe:animate-[missionStepIn_0.28s_ease-out_both] flex min-h-[12rem] flex-1 flex-col items-center justify-start text-center">
                  <div className="w-full px-3 pt-7">
                    <h2
                      id="mission-modal-title"
                      className="text-center text-[1.17rem] font-semibold leading-snug text-zinc-900"
                    >
                      {missionTitleText}
                    </h2>
                    <p className="mt-3 max-w-[20rem] break-words text-center text-[0.9rem] font-normal leading-relaxed text-zinc-600">
                      {missionDescOneLine || '\u00A0'}
                    </p>
                  </div>
                  <div className={cardStickyCtaClass}>
                    <div
                      className="mx-auto mb-2 h-px w-full max-w-[18rem]"
                      style={{
                        background:
                          'linear-gradient(to right, transparent, rgba(161,161,170,0.7), transparent)',
                      }}
                    />
                    <p className="mb-2 text-center text-[0.78rem] font-normal italic leading-relaxed text-zinc-500">
                      MP4/WEBM only, up to {prettyMb(MAX_VIDEO_UPLOAD_BYTES)}.
                    </p>
                    <label
                      htmlFor="mission-video-file"
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[0.95rem] font-semibold text-white transition active:scale-[0.99] hover:brightness-110 disabled:opacity-50"
                      style={{ backgroundColor: '#6231fb' }}
                    >
                      <span aria-hidden>🎥</span>
                      <span>Choose video</span>
                    </label>
                  </div>
                </div>
              )}

              {isVideoTwoStep && videoStep === 2 && (
                <form
                  onSubmit={handleSubmit}
                  className="motion-safe:animate-[missionStepIn_0.28s_ease-out_both] flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-6 pt-3 sm:pb-8">
                    <h2 className="text-center text-[1.17rem] font-semibold leading-snug text-zinc-900">
                      {missionTitleText}
                    </h2>
                    {videoPreviewUrl ? (
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        className="relative mx-auto block h-[70px] w-[70px] overflow-hidden rounded-full border border-zinc-200/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a53fa]/40"
                        aria-label="Change video"
                      >
                        <video
                          src={videoPreviewUrl}
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-black/15 pb-1 text-[0.66rem] font-medium leading-tight text-white">
                          Change
                        </span>
                      </button>
                    ) : null}
                    <label htmlFor="mission-msg-video" className="sr-only">
                      Message
                    </label>
                    <input
                      id="mission-msg-video"
                      type="text"
                      required={mission.message_required === true}
                      placeholder="Write a message"
                      value={messageText}
                      onChange={(e) => {
                        setMessageText(e.target.value)
                        setSubmitError(null)
                      }}
                      disabled={!missionsEnabled || submitting}
                      autoComplete="off"
                      className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-[#4a53fa]/30"
                    />
                    {submitError ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {submitError}
                      </div>
                    ) : null}
                    {success ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Submission received. Awaiting approval.
                      </div>
                    ) : null}
                  </div>
                  <div className={cardStickyCtaClass}>
                    {renderPrimaryCta('Publish')}
                  </div>
                </form>
              )}

              {(submission_type === 'text' || submission_type === 'signature') && (
                <form
                  onSubmit={handleSubmit}
                  className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <div
                    className={`min-h-0 flex-1 overflow-y-auto ${submission_type === 'signature' ? 'space-y-2' : 'space-y-3'}`}
                  >
                    {submission_type === 'text' && (
                      <div className="text-left">
                        <label htmlFor="mission-text-body" className="sr-only">
                          Message
                        </label>
                        <textarea
                          id="mission-text-body"
                          value={messageText}
                          onChange={(e) => {
                            setMessageText(e.target.value)
                            setSubmitError(null)
                          }}
                          required
                          rows={2}
                          placeholder="Write a message"
                          disabled={!missionsEnabled || submitting}
                          className="w-full rounded-2xl bg-zinc-100 px-3 py-2 text-zinc-900 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-[#4a53fa]/25"
                        />
                      </div>
                    )}

                    {submission_type === 'signature' && (
                      <div className="text-left">
                        {mission.target_person_name ? (
                          <p className="text-zinc-700">
                            Sign for:{' '}
                            <span className="font-medium">{mission.target_person_name}</span>
                          </p>
                        ) : null}
                        {mission.submission_hint ? (
                          <p
                            className={
                              mission.target_person_name ? 'mt-1 text-zinc-600' : 'text-zinc-600'
                            }
                          >
                            {mission.submission_hint}
                          </p>
                        ) : null}
                        <div className="relative mt-2 w-full">
                          {signatureCueVisible ? (
                            <div
                              className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 pb-5 pt-2 text-zinc-400"
                              aria-hidden
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-7 w-7 opacity-70"
                                aria-hidden
                              >
                                <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              <div className="h-px w-[min(75%,11rem)] bg-zinc-300/90" />
                            </div>
                          ) : null}
                          <SignaturePad
                            padRef={signaturePadRef as React.RefObject<{ getBlob: () => Promise<Blob | null>; clear: () => void; isEmpty: () => boolean } | null>}
                            onStrokeStart={() => setSignatureCueVisible(false)}
                            onStrokeEnd={() => setHasSignature(true)}
                            showClearButton={false}
                            disabled={!missionsEnabled || submitting}
                            height={120}
                            canvasSurfaceClassName="rounded-2xl border border-zinc-200/90 bg-zinc-100"
                            strokeColor="#18181b"
                          />
                        </div>
                        {mission.message_required ? (
                          <input
                            id="mission-msg-sig"
                            type="text"
                            required
                            placeholder="Write a message (required)"
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            className="mt-2 w-full rounded-2xl bg-zinc-100 px-3 py-[5px] text-zinc-900 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-[#4a53fa]/25"
                          />
                        ) : null}
                      </div>
                    )}

                    {submitError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                        {submitError}
                      </div>
                    )}

                    {success && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
                        Submission received. Awaiting approval.
                      </div>
                    )}
                  </div>
                  <div className={cardStickyCtaClass}>
                    {renderPrimaryCta('Submit')}
                  </div>
                </form>
              )}

            </>
          )}

                </div>

                {(missionsEnabled === false ||
                  completed ||
                  (pending && !success) ||
                  atSubmissionLimit) && (
                  <div className={cardCtaBarClass}>
                    {missionsEnabled === false ? (
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full rounded-xl bg-zinc-900 py-3.5 text-[0.95rem] font-semibold text-white active:scale-[0.99] hover:bg-zinc-800"
                      >
                        OK
                      </button>
                    ) : completed ? (
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full rounded-xl bg-zinc-900 px-4 py-3.5 text-[0.95rem] font-semibold text-white active:scale-[0.99] hover:bg-zinc-800"
                      >
                        Done
                      </button>
                    ) : pending ? (
                      <button
                        type="button"
                        disabled
                        className="flex w-full cursor-default items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-[0.95rem] font-semibold text-amber-900"
                      >
                        <span aria-hidden>⏳</span>
                        Pending review
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onClose}
                        disabled
                        aria-disabled
                        className="w-full cursor-not-allowed rounded-xl bg-zinc-300 py-3.5 text-[0.95rem] font-semibold text-zinc-600"
                      >
                        Done
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          {rewardFlights.map((coin) => (
            <img
              key={coin.id}
              src={coin.iconUrl}
              alt=""
              aria-hidden
              className="pointer-events-none fixed z-[80] h-6 w-6 object-contain will-change-transform will-change-opacity"
              style={{
                left: coin.startX,
                top: coin.startY,
                transform: rewardAbsorbing
                  ? `translate(${coin.endX - coin.startX}px, ${
                      coin.endY - coin.startY + coin.curveY
                    }px) rotate(${coin.rotateDeg}deg) scale(${coin.scaleEnd})`
                  : `translate(0px, 0px) rotate(${coin.rotateDeg * 0.35}deg) scale(${coin.scaleStart})`,
                opacity: rewardAbsorbing ? 0.08 : 0.98,
                transitionProperty: 'transform, opacity',
                transitionDuration: '620ms, 620ms',
                transitionTimingFunction: 'cubic-bezier(0.2,0.75,0.2,1), ease-in',
                transitionDelay: `${coin.delayMs}ms`,
              }}
            />
          ))}
          <div
            className="pointer-events-auto mt-5 flex w-full shrink-0 flex-col items-center gap-1.5 px-4 pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className={closeCircleBtnClass}
              aria-label="Close"
            >
              <span aria-hidden className="leading-none translate-y-[1px]">
                ×
              </span>
            </button>
            <span className={closeClusterLabelClass}>Close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
