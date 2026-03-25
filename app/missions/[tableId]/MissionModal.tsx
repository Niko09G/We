'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { effectiveMaxSubmissionsPerTable } from '@/lib/mission-limits'
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
import {
  COIN_SIZE,
  MISSION_COMPLETED_TEXT_CLASS,
  MISSION_COMPLETED_TINT_CLASS,
  MISSION_INPUT_CLASS,
  MISSION_OVERLAY_CTA_BAR_PAD,
  MISSION_PENDING_TEXT_CLASS,
  MISSION_PENDING_TINT_CLASS,
  MISSION_PRIMARY_CTA_CLASS,
  MISSION_SIGNATURE_TEXT,
  MISSION_SIGNATURE_TINT_BG,
} from '@/lib/mission-ui'
import { DEFAULT_MISSION_SUBMIT_SUCCESS_MESSAGE } from '@/lib/mission-success-copy'
import { MissionSubmitConfetti } from '@/components/guest/MissionSubmitConfetti'

type RewardFlightCoin = {
  id: string
  role: 'lead' | 'support'
  iconUrl: string
  startX: number
  startY: number
  /** Lead: HUD target center. Support: unused (0). */
  endX: number
  endY: number
  /** Support burst offset in px; lead uses 0. */
  burstX: number
  burstY: number
  rotateDeg: number
  scaleStart: number
  scaleEnd: number
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
  /** Shown in overlay after successful submit; null/empty → default copy. */
  success_message?: string | null
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
  /** Next rank emblem for “complete to reach” — announcement only; HUD stays on current rank. */
  nextRankEmblemUrl?: string | null
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
  nextRankEmblemUrl = null,
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
  const [confettiFire, setConfettiFire] = useState(0)
  const [rewardFlights, setRewardFlights] = useState<RewardFlightCoin[]>([])
  const [rewardFlightActive, setRewardFlightActive] = useState(false)
  const [rewardCounterValue, setRewardCounterValue] = useState<number | null>(null)
  /** HUD points before this submission’s reward; avoids refetch jumping the count before the flight. */
  const [rewardDisplayBase, setRewardDisplayBase] = useState<number | null>(null)
  const [rewardClaimSummaryVisible, setRewardClaimSummaryVisible] = useState(false)
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
  const flightImgRefs = useRef<Map<string, HTMLImageElement>>(new Map())
  const rewardHudRef = useRef(rewardHud)
  const rewardDisplayBaseRef = useRef<number | null>(null)
  rewardHudRef.current = rewardHud
  rewardDisplayBaseRef.current = rewardDisplayBase

  const REWARD_LEAD_FLIGHT_MS = 820
  const REWARD_SUPPORT_FLIGHT_MS = 700
  const REWARD_COIN_STAGGER_MS = 58
  const REWARD_COUNTER_TICK_MS = 480
  const MAX_SUPPORT_COINS = 3
  /** Slightly smaller than HUD coin; keeps motion light on small screens. */
  const REWARD_FLIGHT_COIN_PX = 18

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
    setConfettiFire(0)
    setRewardFlights([])
    setRewardFlightActive(false)
    setRewardCounterValue(null)
    setRewardDisplayBase(null)
    setRewardClaimSummaryVisible(false)
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
    setConfettiFire(0)
    setRewardFlights([])
    setRewardFlightActive(false)
    setRewardCounterValue(null)
    setRewardDisplayBase(null)
    setRewardClaimSummaryVisible(false)
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

  const showInlineSuccess = success && missionsEnabled && !isBeatcoinMission
  const successBodyText =
    mission.success_message != null && mission.success_message.trim() !== ''
      ? mission.success_message.trim()
      : DEFAULT_MISSION_SUBMIT_SUCCESS_MESSAGE

  const capAfterSubmit = effectiveMaxSubmissionsPerTable({
    max_submissions_per_table: mission.max_submissions_per_table,
    allow_multiple_submissions: mission.allow_multiple_submissions,
  })
  const optimisticSlotsUsed = submissionSlotsUsed + (success ? 1 : 0)
  const atLimitAfterSubmit =
    capAfterSubmit != null && optimisticSlotsUsed >= capAfterSubmit
  const canSubmitAnother =
    success &&
    missionsEnabled &&
    !pending &&
    !completed &&
    !atLimitAfterSubmit &&
    !atSubmissionLimit

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

  function prepareForAnotherSubmission() {
    clearFile()
    clearVideo()
    setMessageText('')
    setHasSignature(false)
    setSignatureCueVisible(true)
    setSubmitError(null)
    setSuccess(false)
    setConfettiFire(0)
    setRewardFlights([])
    setRewardFlightActive(false)
    setRewardCounterValue(null)
    setRewardDisplayBase(null)
    setRewardClaimSummaryVisible(false)
    signaturePadRef.current?.clear()
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (videoInputRef.current) videoInputRef.current.value = ''
    onSuccess()
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
      if (rewardHud) setRewardDisplayBase(rewardHud.teamPoints)
      setConfettiFire((n) => n + 1)
      if (result.autoApproved) {
        setPending(false)
        setCompleted(false)
        setRejected(false)
      } else {
        setPending(true)
        setCompleted(false)
        setRejected(false)
      }
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

  /** Scrollable overlay body only — CTAs live in `overlayCtaBarClass` (same band as Done). */
  const cardScrollAreaClass =
    'min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pl-[10px] pr-3 pb-4 pt-2 sm:pr-4 sm:pt-2.5'
  /** Full-width footer: matches completed-state Done (not nested under scroll padding). */
  const overlayCtaBarClass = `w-full min-w-0 shrink-0 bg-white ${MISSION_OVERLAY_CTA_BAR_PAD}`
  const overlaySecondaryCtaClass =
    'w-full rounded-xl border border-zinc-200 bg-white py-3 text-center text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 active:scale-[0.99] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'

  const inActiveMissionForm =
    missionsEnabled && !completed && !pending && !atSubmissionLimit
  const isPhotoTwoStep =
    submission_type === 'photo' && inActiveMissionForm && !isBeatcoinMission
  const isVideoTwoStep =
    submission_type === 'video' && inActiveMissionForm && !isBeatcoinMission
  const showStandardMissionHeader = !isPhotoTwoStep && !isVideoTwoStep
  /** Same condition as the Done/Awaiting footer — primary CTAs must not duplicate this band. */
  const showOverlayTerminalFooter =
    missionsEnabled === false ||
    completed ||
    (pending && !success) ||
    atSubmissionLimit

  const missionTitleText = mission.header_title?.trim() || mission.title
  const missionArtworkUrl = mission.header_image_url?.trim() || null
  const missionDescriptionBody =
    mission.description != null && mission.description.trim() !== ''
      ? mission.description
      : null
  const missionBodyTextClass =
    'text-[0.9rem] font-normal leading-relaxed text-zinc-600 whitespace-pre-wrap break-words'
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
  const displayedTeamPoints =
    rewardCounterValue ??
    (rewardDisplayBase != null ? rewardDisplayBase : (rewardHud?.teamPoints ?? 0))

  const rewardAmount = Math.max(
    0,
    Number(mission.points) || Number(rewardHud?.missionRewardPoints) || 0
  )
  const isPendingState = pending && !success
  const maxSubmissionsCap = effectiveMaxSubmissionsPerTable({
    max_submissions_per_table: mission.max_submissions_per_table,
    allow_multiple_submissions: mission.allow_multiple_submissions,
  })
  const attemptsRightText =
    maxSubmissionsCap == null
      ? 'Unlimited'
      : `${Math.min(submissionSlotsUsed, maxSubmissionsCap)} / ${maxSubmissionsCap} attempts`
  const showRankUpTeaser =
    Boolean(rewardHud?.missionCouldReachNextRank) &&
    rewardHud?.nextRankTarget != null &&
    (typeof nextRankEmblemUrl === 'string' && nextRankEmblemUrl.trim().length > 0)

  function runRewardClaimAnimation() {
    if (!rewardHud) return
    if (rewardFlightActive) return
    const from = claimRewardBtnRef.current?.getBoundingClientRect()
    const to = missionOverlayCoinCountRef.current?.getBoundingClientRect()
    const base = rewardDisplayBase ?? rewardHud.teamPoints
    const gain = rewardHud.missionRewardPoints
    const target = base + gain

    if (!from || !to || animationAltIcons.length === 0) {
      setRewardCounterValue(target)
      setRewardDisplayBase(null)
      setRewardClaimSummaryVisible(true)
      return
    }

    const startX = from.left + from.width / 2
    const startY = from.top + from.height / 2
    const endX = to.left + to.width / 2
    const endY = to.top + to.height / 2
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const supportCount = Math.min(MAX_SUPPORT_COINS, Math.max(2, animationAltIcons.length - 1))

    const coins: RewardFlightCoin[] = []
    coins.push({
      id: `${runId}-lead`,
      role: 'lead',
      iconUrl: animationAltIcons[0]!,
      startX,
      startY,
      endX,
      endY,
      burstX: 0,
      burstY: 0,
      rotateDeg: 12 + Math.random() * 14,
      scaleStart: 1,
      scaleEnd: 0.66 + Math.random() * 0.06,
      delayMs: 0,
    })

    let iconPick = 1
    for (let i = 0; i < supportCount; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 0.72)
      const dist = 68 + Math.random() * 48
      coins.push({
        id: `${runId}-s${i}`,
        role: 'support',
        iconUrl: animationAltIcons[iconPick % animationAltIcons.length]!,
        startX,
        startY,
        endX: 0,
        endY: 0,
        burstX: Math.cos(angle) * dist,
        burstY: Math.sin(angle) * dist,
        rotateDeg: (Math.random() - 0.5) * 40,
        scaleStart: 0.84 + Math.random() * 0.1,
        scaleEnd: 0.22 + Math.random() * 0.1,
        delayMs: REWARD_COIN_STAGGER_MS * (i + 1),
      })
      iconPick += 1
    }

    setRewardFlights(coins)
    setRewardFlightActive(true)
  }

  useLayoutEffect(() => {
    if (rewardFlights.length === 0) return

    let cancelled = false
    let landed = false
    const animations: Animation[] = []

    const onLeadCoinLanded = () => {
      if (cancelled || landed) return
      landed = true

      const hud = rewardHudRef.current
      if (!hud) {
        setRewardFlightActive(false)
        setRewardFlights([])
        return
      }
      const b = rewardDisplayBaseRef.current ?? hud.teamPoints
      const g = hud.missionRewardPoints
      const finalVal = b + g
      const counterMs = REWARD_COUNTER_TICK_MS
      const startMs = performance.now()

      const tick = (now: number) => {
        if (cancelled) return
        const t = Math.min(1, (now - startMs) / counterMs)
        const eased = 1 - (1 - t) ** 3
        setRewardCounterValue(Math.round(b + (finalVal - b) * eased))
        if (t < 1) requestAnimationFrame(tick)
        else {
          setRewardCounterValue(finalVal)
          setRewardDisplayBase(null)
          setRewardClaimSummaryVisible(true)
        }
      }
      requestAnimationFrame(tick)

      const hudEl = rewardHudBadgeRef.current
      if (hudEl?.animate) {
        hudEl.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.09)' },
            { transform: 'scale(0.97)' },
            { transform: 'scale(1)' },
          ],
          { duration: 300, easing: 'ease-out' }
        )
      }
    }

    const lead = rewardFlights.find((c) => c.role === 'lead')
    const supports = rewardFlights.filter((c) => c.role === 'support')
    const flightMap = flightImgRefs.current

    if (lead) {
      const el = flightMap.get(lead.id)
      if (el) {
        const dx = lead.endX - lead.startX
        const dy = lead.endY - lead.startY
        const nx = -dy * 0.38
        const ny = dx * 0.2
        const mx = dx * 0.48 + nx
        const my = dy * 0.48 + ny
        const anim = el.animate(
          [
            {
              transform: `translate(0px,0px) rotate(0deg) scale(${lead.scaleStart})`,
              opacity: 1,
            },
            {
              transform: `translate(${mx}px,${my}px) rotate(${lead.rotateDeg * 0.42}deg) scale(${(lead.scaleStart + lead.scaleEnd) * 0.52})`,
              opacity: 1,
            },
            {
              transform: `translate(${dx}px,${dy}px) rotate(${lead.rotateDeg}deg) scale(${lead.scaleEnd})`,
              opacity: 0.18,
            },
            {
              transform: `translate(${dx}px,${dy}px) rotate(${lead.rotateDeg}deg) scale(${lead.scaleEnd * 0.72})`,
              opacity: 0,
            },
          ],
          {
            duration: REWARD_LEAD_FLIGHT_MS,
            delay: lead.delayMs,
            easing: 'cubic-bezier(0.22, 0.65, 0.36, 1)',
            fill: 'forwards',
          }
        )
        animations.push(anim)
        void anim.finished
          .then(() => {
            if (!cancelled) onLeadCoinLanded()
          })
          .catch(() => {
            /* animation cancelled */
          })
      } else {
        window.setTimeout(() => {
          if (!cancelled) onLeadCoinLanded()
        }, REWARD_LEAD_FLIGHT_MS + lead.delayMs)
      }
    } else {
      onLeadCoinLanded()
    }

    for (const c of supports) {
      const el = flightMap.get(c.id)
      if (!el) continue
      const anim = el.animate(
        [
          {
            transform: `translate(0px,0px) rotate(0deg) scale(${c.scaleStart})`,
            opacity: 0.96,
          },
          {
            transform: `translate(${c.burstX * 0.32}px,${c.burstY * 0.32}px) rotate(${c.rotateDeg * 0.28}deg) scale(${c.scaleStart * 0.94})`,
            opacity: 0.72,
            offset: 0.42,
          },
          {
            transform: `translate(${c.burstX}px,${c.burstY}px) rotate(${c.rotateDeg}deg) scale(${c.scaleEnd})`,
            opacity: 0,
          },
        ],
        {
          duration: REWARD_SUPPORT_FLIGHT_MS,
          delay: c.delayMs,
          easing: 'cubic-bezier(0.33, 0, 0.19, 1)',
          fill: 'forwards',
        }
      )
      animations.push(anim)
    }

    const maxEnd = Math.max(
      REWARD_LEAD_FLIGHT_MS + (lead?.delayMs ?? 0),
      ...supports.map((c) => REWARD_SUPPORT_FLIGHT_MS + c.delayMs),
      0
    )
    const clearFlightsAt = Math.max(
      maxEnd + 120,
      REWARD_LEAD_FLIGHT_MS + REWARD_COUNTER_TICK_MS + 200
    )
    const clearTimer = window.setTimeout(() => {
      if (cancelled) return
      setRewardFlights([])
      setRewardFlightActive(false)
    }, clearFlightsAt)

    return () => {
      cancelled = true
      window.clearTimeout(clearTimer)
      for (const a of animations) {
        try {
          a.cancel()
        } catch {
          /* ignore */
        }
      }
    }
  }, [rewardFlights])

  function handleBackdropDismiss(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  function renderPrimaryCta(defaultLabel: string) {
    if (success && rewardHud && !showInlineSuccess) {
      if (rewardClaimSummaryVisible) {
        return (
          <div className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-center text-[0.92rem] font-medium text-emerald-800">
            <span>✓ Mission completed (+{rewardAmount})</span>
            <RewardUnitIcon size={COIN_SIZE} />
          </div>
        )
      }
      return (
        <button
          ref={claimRewardBtnRef}
          type="button"
          onClick={() => runRewardClaimAnimation()}
          disabled={rewardFlightActive}
          className={MISSION_PRIMARY_CTA_CLASS}
        >
          {rewardFlightActive ? 'Claiming…' : `Claim +${rewardHud.missionRewardPoints}`}
          <RewardUnitIcon size={COIN_SIZE} />
        </button>
      )
    }
    return (
      <button
        type="submit"
        disabled={!canSubmit}
        className={MISSION_PRIMARY_CTA_CLASS}
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
                          <RewardUnitIcon size={COIN_SIZE} />
                          <span ref={missionOverlayCoinCountValueRef}>{displayedTeamPoints}</span>
                        </span>
                        {!completed ? (
                          <span
                            ref={missionOverlayRewardHeadlineRef}
                            data-mission-overlay-reward-headline
                            className={`inline-flex items-center gap-0.5 tabular-nums leading-none text-emerald-400/85 ${hudGradientStatsClass}`}
                          >
                            <span data-mission-overlay-reward-amount>(+{rewardAmount})</span>
                            <RewardUnitIcon size={COIN_SIZE} />
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
                  {completed || atSubmissionLimit ? (
                    <div
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.9rem] font-medium ${MISSION_COMPLETED_TINT_CLASS} ${MISSION_COMPLETED_TEXT_CLASS}`}
                      data-mission-overlay-announcement
                    >
                      <span>✓ Mission completed (+{rewardAmount})</span>
                      <RewardUnitIcon size={COIN_SIZE} />
                    </div>
                  ) : isPendingState ? (
                    <div
                      className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg px-3 py-2 text-[0.9rem] font-medium ${MISSION_PENDING_TINT_CLASS} ${MISSION_PENDING_TEXT_CLASS}`}
                      data-mission-overlay-announcement
                    >
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <span className="truncate">
                          Pending review (+{rewardAmount})
                        </span>
                        <RewardUnitIcon size={COIN_SIZE} className="shrink-0" />
                      </span>
                      <span
                        className={`text-right text-[0.78rem] font-medium tracking-tight sm:text-[0.82rem] opacity-90 ${MISSION_PENDING_TEXT_CLASS}`}
                      >
                        {attemptsRightText}
                      </span>
                    </div>
                  ) : (
                    <div data-mission-overlay-announcement>
                      <div
                        className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg px-3 py-2 text-[0.9rem] font-medium"
                        style={{
                          backgroundColor: MISSION_SIGNATURE_TINT_BG,
                          color: MISSION_SIGNATURE_TEXT,
                        }}
                      >
                        <span className="inline-flex min-w-0 items-center gap-1 font-semibold">
                          <span className="truncate">Grants +{rewardAmount}</span>
                          <RewardUnitIcon size={COIN_SIZE} className="shrink-0" />
                        </span>
                        <span
                          className="text-right text-[0.78rem] font-semibold tracking-tight opacity-95 sm:text-[0.82rem]"
                          style={{ color: MISSION_SIGNATURE_TEXT }}
                        >
                          {attemptsRightText}
                        </span>
                      </div>
                      {showRankUpTeaser ? (
                        <p className="mt-2 flex items-center justify-center gap-2 text-center text-[0.8rem] font-medium text-zinc-600">
                          <span>Complete this to reach</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={nextRankEmblemUrl!.trim()}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded object-contain"
                          />
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {showInlineSuccess ? (
                  <>
                    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden motion-safe:animate-[missionStepIn_0.28s_ease-out_both]">
                      <MissionSubmitConfetti fireKey={confettiFire} />
                      <div
                        className={`${cardScrollAreaClass} flex min-h-[11rem] flex-1 flex-col items-center justify-center px-5 pb-2 pt-5 text-center`}
                      >
                        <div
                          className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300"
                          aria-hidden
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-7 w-7"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                        <h2 className="text-[1.15rem] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                          Nice one!
                        </h2>
                        <p className="mt-3 max-w-[22rem] text-pretty text-[0.92rem] font-normal leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {successBodyText}
                        </p>
                        {pending ? (
                          <p className="mt-4 max-w-[22rem] text-pretty text-[0.82rem] font-medium leading-relaxed text-zinc-500 dark:text-zinc-500">
                            We&apos;ll take it from here while this is reviewed.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className={`${overlayCtaBarClass} flex flex-col gap-2`}>
                      {rewardHud && !pending && !rewardClaimSummaryVisible ? (
                        <>
                          <button
                            ref={claimRewardBtnRef}
                            type="button"
                            onClick={() => runRewardClaimAnimation()}
                            disabled={rewardFlightActive}
                            className={MISSION_PRIMARY_CTA_CLASS}
                          >
                            {rewardFlightActive
                              ? 'Claiming…'
                              : `Claim +${rewardHud.missionRewardPoints}`}
                            <RewardUnitIcon size={COIN_SIZE} />
                          </button>
                          <button
                            type="button"
                            onClick={onClose}
                            className={overlaySecondaryCtaClass}
                          >
                            Close
                          </button>
                        </>
                      ) : rewardHud &&
                        !pending &&
                        rewardClaimSummaryVisible &&
                        canSubmitAnother ? (
                        <>
                          <button
                            type="button"
                            onClick={prepareForAnotherSubmission}
                            className={MISSION_PRIMARY_CTA_CLASS}
                          >
                            Submit another
                          </button>
                          <button
                            type="button"
                            onClick={onClose}
                            className={overlaySecondaryCtaClass}
                          >
                            Close
                          </button>
                        </>
                      ) : rewardHud &&
                        !pending &&
                        rewardClaimSummaryVisible &&
                        !canSubmitAnother ? (
                        <button
                          type="button"
                          onClick={onClose}
                          className={MISSION_PRIMARY_CTA_CLASS}
                        >
                          Done
                        </button>
                      ) : canSubmitAnother ? (
                        <>
                          <button
                            type="button"
                            onClick={prepareForAnotherSubmission}
                            className={MISSION_PRIMARY_CTA_CLASS}
                          >
                            Submit another
                          </button>
                          <button
                            type="button"
                            onClick={onClose}
                            className={overlaySecondaryCtaClass}
                          >
                            Close
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={onClose} className={MISSION_PRIMARY_CTA_CLASS}>
                          Done
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                {!showOverlayTerminalFooter && isPhotoTwoStep ? (
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
                ) : null}
                {!showOverlayTerminalFooter && isVideoTwoStep ? (
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
                ) : null}

                {!showOverlayTerminalFooter &&
                isPhotoTwoStep &&
                photoStep === 1 ? (
                  <>
                    <div
                      className={`motion-safe:animate-[missionStepIn_0.28s_ease-out_both] ${cardScrollAreaClass} flex min-h-[12rem] flex-col font-sans text-[0.9rem] font-normal leading-relaxed`}
                    >
                      <div className="flex w-full flex-col items-center px-3 pt-7 text-center">
                        <h2
                          id="mission-modal-title"
                          className="text-center text-[1.17rem] font-semibold leading-snug text-zinc-900"
                        >
                          {missionTitleText}
                        </h2>
                        {missionDescriptionBody ? (
                          <p
                            className={`mt-3 max-w-[20rem] text-center ${missionBodyTextClass}`}
                          >
                            {missionDescriptionBody}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className={overlayCtaBarClass}>
                      <div
                        className="mx-auto mb-3 h-px w-full max-w-[18rem]"
                        style={{
                          background:
                            'linear-gradient(to right, transparent, rgba(161,161,170,0.7), transparent)',
                        }}
                      />
                      <p className="mb-4 text-center text-[0.78rem] font-normal italic leading-relaxed text-zinc-500">
                        JPG/PNG/WebP only, up to {prettyMb(MAX_IMAGE_UPLOAD_BYTES)}.
                      </p>
                      <label
                        htmlFor="mission-photo-file"
                        className={MISSION_PRIMARY_CTA_CLASS}
                      >
                        <span aria-hidden>📸</span>
                        <span>Choose photo</span>
                      </label>
                    </div>
                  </>
                ) : !showOverlayTerminalFooter &&
                  isPhotoTwoStep &&
                  photoStep === 2 ? (
                  <form
                    onSubmit={handleSubmit}
                    className="motion-safe:animate-[missionStepIn_0.28s_ease-out_both] flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
                  >
                    <div
                      className={`${cardScrollAreaClass} flex min-h-0 flex-1 flex-col gap-3 px-1 pt-3 font-sans text-[0.9rem] font-normal leading-relaxed`}
                    >
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
                        className={MISSION_INPUT_CLASS}
                      />
                      {submitError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                          {submitError}
                        </div>
                      ) : null}
                    </div>
                    <div className={overlayCtaBarClass}>
                      {renderPrimaryCta('Publish')}
                    </div>
                  </form>
                ) : !showOverlayTerminalFooter &&
                  isVideoTwoStep &&
                  videoStep === 1 ? (
                  <>
                    <div
                      className={`motion-safe:animate-[missionStepIn_0.28s_ease-out_both] ${cardScrollAreaClass} flex min-h-[12rem] flex-col font-sans text-[0.9rem] font-normal leading-relaxed`}
                    >
                      <div className="flex w-full flex-col items-center px-3 pt-7 text-center">
                        <h2
                          id="mission-modal-title"
                          className="text-center text-[1.17rem] font-semibold leading-snug text-zinc-900"
                        >
                          {missionTitleText}
                        </h2>
                        {missionDescriptionBody ? (
                          <p
                            className={`mt-3 max-w-[20rem] text-center ${missionBodyTextClass}`}
                          >
                            {missionDescriptionBody}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className={overlayCtaBarClass}>
                      <div
                        className="mx-auto mb-3 h-px w-full max-w-[18rem]"
                        style={{
                          background:
                            'linear-gradient(to right, transparent, rgba(161,161,170,0.7), transparent)',
                        }}
                      />
                      <p className="mb-4 text-center text-[0.78rem] font-normal italic leading-relaxed text-zinc-500">
                        MP4/WEBM only, up to {prettyMb(MAX_VIDEO_UPLOAD_BYTES)}.
                      </p>
                      <label
                        htmlFor="mission-video-file"
                        className={MISSION_PRIMARY_CTA_CLASS}
                      >
                        <span aria-hidden>🎥</span>
                        <span>Choose video</span>
                      </label>
                    </div>
                  </>
                ) : !showOverlayTerminalFooter &&
                  isVideoTwoStep &&
                  videoStep === 2 ? (
                  <form
                    onSubmit={handleSubmit}
                    className="motion-safe:animate-[missionStepIn_0.28s_ease-out_both] flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
                  >
                    <div
                      className={`${cardScrollAreaClass} flex min-h-0 flex-1 flex-col gap-3 px-1 pt-3 font-sans text-[0.9rem] font-normal leading-relaxed`}
                    >
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
                        className={MISSION_INPUT_CLASS}
                      />
                      {submitError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                          {submitError}
                        </div>
                      ) : null}
                    </div>
                    <div className={overlayCtaBarClass}>
                      {renderPrimaryCta('Publish')}
                    </div>
                  </form>
                ) : !showOverlayTerminalFooter &&
                  isBeatcoinMission &&
                  inActiveMissionForm ? (
                  <>
                    <div
                      className={`${cardScrollAreaClass} font-sans text-[0.9rem] font-normal leading-relaxed sm:pt-2`}
                    >
                      {missionDescriptionBody ? (
                        <p
                          className={`mt-6 px-5 text-center text-[0.95rem] ${missionBodyTextClass}`}
                        >
                          {missionDescriptionBody}
                        </p>
                      ) : null}
                    </div>
                    <div className={overlayCtaBarClass}>
                      <button
                        type="button"
                        onClick={onClose}
                        className={MISSION_PRIMARY_CTA_CLASS}
                      >
                        Got it
                      </button>
                    </div>
                  </>
                ) : !showOverlayTerminalFooter &&
                  !isBeatcoinMission &&
                  (submission_type === 'text' || submission_type === 'signature') ? (
                  <form
                    onSubmit={handleSubmit}
                    className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
                  >
                    <div
                      className={`${cardScrollAreaClass} min-h-0 flex-1 overflow-y-auto text-center font-sans text-[0.9rem] font-normal leading-relaxed sm:pt-2 ${submission_type === 'signature' ? 'space-y-2' : 'space-y-3'}`}
                    >
                      {submission_type === 'text' && (
                        <div className="mx-auto w-full max-w-md px-1">
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
                            className={MISSION_INPUT_CLASS}
                          />
                        </div>
                      )}

                      {submission_type === 'signature' && (
                        <div className="w-full px-1">
                          {mission.target_person_name ? (
                            <p className="text-balance text-zinc-700">
                              Sign for:{' '}
                              <span className="font-medium">{mission.target_person_name}</span>
                            </p>
                          ) : null}
                          {mission.submission_hint ? (
                            <p
                              className={`text-balance text-zinc-600 ${
                                mission.target_person_name ? 'mt-1' : ''
                              }`}
                            >
                              {mission.submission_hint}
                            </p>
                          ) : null}
                          <div className="relative mx-auto mt-2 w-full max-w-md">
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
                              padRef={
                                signaturePadRef as React.RefObject<{
                                  getBlob: () => Promise<Blob | null>
                                  clear: () => void
                                  isEmpty: () => boolean
                                } | null>
                              }
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
                              className={`mx-auto mt-2 max-w-md ${MISSION_INPUT_CLASS}`}
                            />
                          ) : null}
                        </div>
                      )}

                      {submitError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                          {submitError}
                        </div>
                      ) : null}
                    </div>
                    <div className={overlayCtaBarClass}>
                      {renderPrimaryCta('Submit')}
                    </div>
                  </form>
                ) : (
                  <div
                    className={`${cardScrollAreaClass} font-sans text-[0.9rem] font-normal leading-relaxed sm:pt-2 ${
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
                        {missionDescriptionBody ? (
                          <p
                            className={`mt-3.5 px-5 text-center sm:px-7 ${missionBodyTextClass}`}
                          >
                            {missionDescriptionBody}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )}

                {showOverlayTerminalFooter ? (
                  <div className={overlayCtaBarClass}>
                    {missionsEnabled === false ? (
                      <button
                        type="button"
                        onClick={onClose}
                        className={MISSION_PRIMARY_CTA_CLASS}
                      >
                        OK
                      </button>
                    ) : completed ? (
                      <button
                        type="button"
                        onClick={onClose}
                        className={MISSION_PRIMARY_CTA_CLASS}
                      >
                        Done
                      </button>
                    ) : pending ? (
                      <button
                        type="button"
                        disabled
                        className={MISSION_PRIMARY_CTA_CLASS}
                      >
                        Awaiting review
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onClose}
                        disabled
                        aria-disabled
                        className={MISSION_PRIMARY_CTA_CLASS}
                      >
                        Done
                      </button>
                    )}
                  </div>
                ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
          {rewardFlights.map((coin) => (
            <img
              key={coin.id}
              ref={(el) => {
                if (el) flightImgRefs.current.set(coin.id, el)
                else flightImgRefs.current.delete(coin.id)
              }}
              data-reward-flight={coin.id}
              src={coin.iconUrl}
              alt=""
              aria-hidden
              className="pointer-events-none fixed z-[80] object-contain will-change-transform"
              style={{
                width: `${REWARD_FLIGHT_COIN_PX}px`,
                height: `${REWARD_FLIGHT_COIN_PX}px`,
                left: coin.startX - REWARD_FLIGHT_COIN_PX / 2,
                top: coin.startY - REWARD_FLIGHT_COIN_PX / 2,
                transform: 'translate(0px, 0px)',
                opacity: 0.98,
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
