'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MissionSocialFeedSection } from '@/components/guest/MissionSocialFeedSection'
import { SeatingMapPanel } from '@/components/guest/SeatingMapPanel'
import { StickySectionNav } from '@/components/guest/StickySectionNav'
import { MissionsTableHero } from '@/components/guest/MissionsTableHero'
import { getMissionsEnabled } from '@/lib/app-settings'
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/leaderboard'
import {
  guestMissionDisplayReward,
  isAtSubmissionLimit,
  isRepeatableAutoMission,
} from '@/lib/mission-limits'
import {
  normalizeMissionValidationType,
  type MissionValidationType,
} from '@/lib/mission-validation-type'
import { supabase } from '@/lib/supabase/client'
import { RewardAmount } from '@/components/reward/RewardAmount'
import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'
import { useRewardUnit } from '@/components/reward/RewardUnitProvider'
import { rewardUnitCompactLabel } from '@/lib/reward-unit'
import { MissionModal, type MissionForModal } from './MissionModal'
import {
  fetchGuestMissionFeed,
  resolveAdviceMissionIdFromRows,
  resolveFeedMissionIds,
  resolveGreetingMissionIdFromRows,
  type GuestMissionFeedItem,
} from '@/lib/guest-mission-feed'
import { saveGuestTableContext } from '@/lib/guest-table-context'
import { COIN_SIZE, safeRewardPoints } from '@/lib/mission-ui'
import {
  fetchGuestEmblemsConfig,
  resolveRankEmblemUrl,
  type GuestEmblemsSettingsValue,
} from '@/lib/guest-emblem-config'
import {
  MISSION_CARD_BACKGROUNDS,
  MISSION_CARD_SKELETON_BACKGROUND,
  TABLE_GREETING_ARTWORK_PATH,
  TRUMPET_STORY_CARD_ARTWORK_PATH,
  guestMissionSurfaceGradient,
} from '@/lib/guest-missions-gradients'
import {
  heroBackgroundStyle,
  leaderboardRowFill,
  resolveTeamPageConfig,
} from '@/lib/team-page-config'

type TableIdParams = { tableId: string }

type MissionRow = {
  id: string
  title: string
  description: string | null
  points: number
  points_per_submission?: number | null
  validation_type: MissionValidationType
  is_active: boolean
  approval_mode?: 'auto' | 'manual'
  allow_multiple_submissions?: boolean
  /** null = unlimited (after migration + backfill). */
  max_submissions_per_table?: number | null
  message_required?: boolean
  target_person_name?: string | null
  submission_hint?: string | null
  header_title?: string | null
  header_image_url?: string | null
  card_theme_index?: number | null
  card_cover_image_url?: string | null
  success_message?: string | null
  card_cta_label?: string | null
  card_completed_label?: string | null
  created_at?: string
}

type CompletionRow = { mission_id: string }
type PendingRow = { mission_id: string }
type ApprovedRow = { mission_id: string }
type MomentumEventType = 'mission' | 'catching_up' | 'lead' | 'momentum'
type MomentumEntry = {
  id: string
  tableId: string
  tableName: string
  tableColor: string | null
  eventType: MomentumEventType
  coinChange: number
  message: string
  createdAt: number
}

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export default function MissionsTablePage({
  params,
}: {
  params: Promise<TableIdParams>
}) {
  const { tableId } = use(params)
  const { config: rewardUnit } = useRewardUnit()
  const router = useRouter()
  const questsRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)

  const [missionsEnabled, setMissionsEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tableName, setTableName] = useState<string>('')
  const [tableColor, setTableColor] = useState<string | null>(null)
  const [tablePageConfigRaw, setTablePageConfigRaw] = useState<unknown>(null)
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardEntry[]>([])

  const [missions, setMissions] = useState<MissionRow[]>([])
  const [pendingMissionIds, setPendingMissionIds] = useState<Set<string>>(
    new Set()
  )
  const [completedMissionIds, setCompletedMissionIds] = useState<Set<string>>(
    new Set()
  )
  const [rejectedSubmissionByMissionId, setRejectedSubmissionByMissionId] =
    useState<
      Map<
        string,
        {
          note: string | null
          submissionData: { image_url?: string; signature_image_url?: string } | null
        }
      >
    >(new Map())
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [missionModalReset, setMissionModalReset] = useState(0)
  const [missionOverlayVariant, setMissionOverlayVariant] = useState<
    'hero-greeting' | 'missions-section'
  >('missions-section')
  const [modalExistingPhotoUrl, setModalExistingPhotoUrl] = useState<string | null>(null)
  const [modalIsRejected, setModalIsRejected] = useState(false)
  const [modalRejectedNote, setModalRejectedNote] = useState<string | null>(null)
  const [submissionSlotsUsedByMission, setSubmissionSlotsUsedByMission] = useState<
    Map<string, number>
  >(new Map())

  const [missionFeedItems, setMissionFeedItems] = useState<GuestMissionFeedItem[]>([])
  const [missionFeedLoading, setMissionFeedLoading] = useState(false)
  const [guestEmblems, setGuestEmblems] = useState<GuestEmblemsSettingsValue>({})
  const [momentumFeed, setMomentumFeed] = useState<MomentumEntry[]>([])
  const [momentumEnterIds, setMomentumEnterIds] = useState<Set<string>>(new Set())
  const prevLeaderboardRef = useRef<LeaderboardEntry[] | null>(null)

  const { tablePoints, tableRank, totalTeams } = useMemo(() => {
    const idx = leaderboardRows.findIndex((e) => e.tableId === tableId)
    return {
      tablePoints: idx >= 0 ? safeRewardPoints(leaderboardRows[idx].totalPoints) : 0,
      tableRank: idx >= 0 ? idx + 1 : null,
      totalTeams: leaderboardRows.length,
    }
  }, [leaderboardRows, tableId])

  const teamPage = useMemo(
    () => resolveTeamPageConfig(tablePageConfigRaw, { tableColor, tableName }),
    [tablePageConfigRaw, tableColor, tableName]
  )

  const leaderboardPreview = useMemo(
    () => leaderboardRows.slice(0, 4),
    [leaderboardRows]
  )
  const heroRankEmblemUrl = useMemo(
    () => resolveRankEmblemUrl(guestEmblems, tableRank),
    [guestEmblems, tableRank]
  )
  const heroTeamEmblemUrl = useMemo(
    () => guestEmblems.team_emblem_by_table_id?.[tableId] ?? null,
    [guestEmblems, tableId]
  )
  const leaderboardMotivation = useMemo(() => {
    if (tableRank == null || leaderboardRows.length === 0) {
      return { kind: 'fallback' as const }
    }
    if (tableRank > 1) {
      const above = leaderboardRows[tableRank - 2]
      if (!above) return { kind: 'fallback' as const }
      const abovePoints = safeRewardPoints(above.totalPoints)
      const delta = Math.max(0, abovePoints - tablePoints)
      return {
        kind: delta <= 5 ? ('close_chase' as const) : ('chase' as const),
        delta,
        targetRank: tableRank - 1,
        targetRankEmblemUrl: resolveRankEmblemUrl(guestEmblems, tableRank - 1),
      }
    }
    if (tableRank === 1) {
      const below = leaderboardRows[1]
      if (!below) return { kind: 'fallback' as const }
      const belowPoints = safeRewardPoints(below.totalPoints)
      return {
        kind: 'leading' as const,
        delta: Math.max(0, tablePoints - belowPoints),
        targetRank: 1,
        targetRankEmblemUrl: resolveRankEmblemUrl(guestEmblems, 1),
      }
    }
    return { kind: 'fallback' as const }
  }, [guestEmblems, leaderboardRows, tablePoints, tableRank])

  const pushMomentum = useCallback((entries: MomentumEntry[]) => {
    if (entries.length === 0) return
    const newIds = entries.map((e) => e.id)
    setMomentumEnterIds((prev) => {
      const next = new Set(prev)
      newIds.forEach((id) => next.add(id))
      return next
    })
    setTimeout(() => {
      setMomentumEnterIds((prev) => {
        const next = new Set(prev)
        newIds.forEach((id) => next.delete(id))
        return next
      })
    }, 700)
    setMomentumFeed((prev) => {
      const seen = new Set(prev.map((e) => e.id))
      const fresh = entries.filter((e) => !seen.has(e.id))
      return [...fresh, ...prev].slice(0, 8)
    })
  }, [])

  const buildMomentumEntries = useCallback(
    (nextLb: LeaderboardEntry[]): MomentumEntry[] => {
      const prevLb = prevLeaderboardRef.current
      prevLeaderboardRef.current = nextLb
      if (!prevLb || prevLb.length === 0 || nextLb.length === 0) return []

      const prevById = new Map(prevLb.map((r) => [r.tableId, r]))
      const now = Date.now()
      const out: MomentumEntry[] = []

      const previousLeader = prevLb[0]?.tableId ?? null
      const nextLeader = nextLb[0]?.tableId ?? null
      if (nextLeader && previousLeader && nextLeader !== previousLeader) {
        const row = nextLb[0]!
        out.push({
          id: `lead-${row.tableId}-${safeRewardPoints(row.totalPoints)}-${now}`,
          tableId: row.tableId,
          tableName: row.tableName,
          tableColor: row.tableColor,
          eventType: 'lead',
          coinChange: 0,
          message: `${row.tableName} just took the lead 👑`,
          createdAt: now,
        })
      }

      for (let i = 0; i < nextLb.length; i++) {
        const row = nextLb[i]!
        const prev = prevById.get(row.tableId)
        if (!prev) continue
        const prevPoints = safeRewardPoints(prev.totalPoints)
        const nextPoints = safeRewardPoints(row.totalPoints)
        const delta = nextPoints - prevPoints
        if (delta <= 0) continue

        const prevRank = prevLb.findIndex((x) => x.tableId === row.tableId) + 1
        const nextRank = i + 1
        const improved = prevRank > 0 && nextRank < prevRank
        const eventType: MomentumEventType = improved
          ? 'catching_up'
          : delta >= 12
            ? 'mission'
            : 'momentum'
        const message =
          eventType === 'mission'
            ? `${row.tableName} completed a mission (+${delta})`
            : eventType === 'catching_up'
              ? `${row.tableName} is catching up (+${delta})`
              : `${row.tableName} gained momentum (+${delta})`

        out.push({
          id: `${row.tableId}-${nextPoints}-${nextRank}-${now}`,
          tableId: row.tableId,
          tableName: row.tableName,
          tableColor: row.tableColor,
          eventType,
          coinChange: delta,
          message,
          createdAt: now,
        })
      }

      return out
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
    },
    []
  )

  const scrollToQuests = () => {
    questsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const greetingMissionId = useMemo(() => {
    return resolveGreetingMissionIdFromRows(missions)
  }, [missions])

  /** Same IDs as carousel cards — feed loads after missions resolve. */
  const feedMissionIds = useMemo(
    () => ({
      adviceMissionId: resolveAdviceMissionIdFromRows(missions),
      greetingMissionId: resolveGreetingMissionIdFromRows(missions),
    }),
    [missions]
  )

  const scrollMissionCarousel = (dir: -1 | 1) => {
    const el = carouselRef.current
    if (!el || missions.length === 0) return
    const card = el.querySelector('[data-mission-card]') as HTMLElement | null
    const gap = 16
    const cardW = card?.offsetWidth ?? Math.min(el.clientWidth * 0.78, 300)
    const step = cardW + gap
    const { scrollLeft, scrollWidth, clientWidth } = el
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    const atEnd = scrollLeft >= maxScroll - 2
    const atStart = scrollLeft <= 2

    if (dir > 0) {
      if (atEnd) el.scrollTo({ left: 0, behavior: 'smooth' })
      else el.scrollBy({ left: step, behavior: 'smooth' })
    } else {
      if (atStart) el.scrollTo({ left: maxScroll, behavior: 'smooth' })
      else el.scrollBy({ left: -step, behavior: 'smooth' })
    }
  }

  const loadMissionFeed = useCallback(async () => {
    if (missionsEnabled !== true) {
      setMissionFeedItems([])
      return
    }
    setMissionFeedLoading(true)
    try {
      const resolved = await resolveFeedMissionIds()
      const adviceId =
        feedMissionIds.adviceMissionId ?? resolved.adviceMissionId
      const greetingId =
        feedMissionIds.greetingMissionId ?? resolved.greetingMissionId
      const items = await fetchGuestMissionFeed(adviceId, greetingId)
      setMissionFeedItems(items)
    } catch {
      setMissionFeedItems([])
    } finally {
      setMissionFeedLoading(false)
    }
  }, [missionsEnabled, feedMissionIds])

  const refreshTableData = useCallback(() => {
    void (async () => {
      try {
        const lb = await fetchLeaderboard()
        setLeaderboardRows(lb)
        pushMomentum(buildMomentumEntries(lb))
      } catch {
        /* keep previous leaderboard */
      }

      const [cRes, pRes, slotRes, rRes] = await Promise.all([
        supabase.from('completions').select('mission_id').eq('table_id', tableId),
        supabase
          .from('mission_submissions')
          .select('mission_id')
          .eq('table_id', tableId)
          .eq('status', 'pending'),
        supabase
          .from('mission_submissions')
          .select('mission_id')
          .eq('table_id', tableId)
          .in('status', ['pending', 'approved']),
        supabase
          .from('mission_submissions')
          .select('mission_id, review_note, submission_data')
          .eq('table_id', tableId)
          .eq('status', 'rejected')
          .order('created_at', { ascending: false })
          .limit(200),
      ])
      if (cRes.data)
        setCompletedMissionIds(
          new Set(((cRes.data ?? []) as CompletionRow[]).map((r) => r.mission_id))
        )
      if (pRes.data)
        setPendingMissionIds(
          new Set(((pRes.data ?? []) as PendingRow[]).map((r) => r.mission_id))
        )
      const slotRows = (slotRes.data ?? []) as ApprovedRow[]
      const slotMap = new Map<string, number>()
      for (const r of slotRows)
        slotMap.set(r.mission_id, (slotMap.get(r.mission_id) ?? 0) + 1)
      setSubmissionSlotsUsedByMission(slotMap)

      const rejectedMap = new Map<
        string,
        {
          note: string | null
          submissionData: { image_url?: string; signature_image_url?: string } | null
        }
      >()
      const rejectedRows = (rRes.data ?? []) as Array<{
        mission_id: string
        review_note?: string | null
        submission_data?: {
          image_url?: string | null
          signature_image_url?: string | null
        } | null
      }>
      for (const row of rejectedRows) {
        if (rejectedMap.has(row.mission_id)) continue
        rejectedMap.set(row.mission_id, {
          note: (row.review_note as string | null) ?? null,
          submissionData: row.submission_data
            ? {
                image_url: row.submission_data.image_url ?? undefined,
                signature_image_url: row.submission_data.signature_image_url ?? undefined,
              }
            : null,
        })
      }
      setRejectedSubmissionByMissionId(rejectedMap)
      void loadMissionFeed()
    })()
  }, [tableId, loadMissionFeed, pushMomentum, buildMomentumEntries])

  useEffect(() => {
    if (loading) return
    const timer = window.setInterval(() => {
      refreshTableData()
    }, 20000)
    return () => window.clearInterval(timer)
  }, [loading, refreshTableData])

  useEffect(() => {
    if (missionsEnabled !== true) {
      setMissionFeedItems([])
      setMissionFeedLoading(false)
    }
  }, [missionsEnabled])

  useEffect(() => {
    if (tableId && tableName.trim()) {
      saveGuestTableContext(tableId, tableName)
    }
  }, [tableId, tableName])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cfg = await fetchGuestEmblemsConfig()
        if (!cancelled) setGuestEmblems(cfg)
      } catch {
        if (!cancelled) setGuestEmblems({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (missionsEnabled !== true || loading) return
    void loadMissionFeed()
  }, [missionsEnabled, loading, loadMissionFeed, missions])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        if (!isUuid(tableId)) {
          setLoading(false)
          setError('Invalid table link. Please select a table again.')
          router.replace('/missions')
          return
        }

        const [tRes, enabled] = await Promise.all([
          supabase
            .from('tables')
            .select('name,color,is_active,is_archived,page_config')
            .eq('id', tableId)
            .maybeSingle(),
          getMissionsEnabled(),
        ])

        if (cancelled) return

        if (tRes.error) throw new Error(`tables: ${tRes.error.message}`)

        const tRow = tRes.data as {
          name?: string | null
          color?: string | null
          is_active?: boolean
          is_archived?: boolean
          page_config?: unknown
        } | null

        if (!tRow) {
          setError('Table not found.')
          setLoading(false)
          return
        }

        if ((tRow.is_archived ?? false) === true) {
          setTablePageConfigRaw(tRow.page_config ?? null)
          setTableName((tRow.name as string) ?? '')
          setTableColor((tRow.color as string | null) ?? null)
          setMissionsEnabled(enabled)
          setError('This team has been archived. Choose another table from the list.')
          setLoading(false)
          return
        }

        setTablePageConfigRaw(tRow.page_config ?? null)
        setTableName((tRow.name as string) ?? '')
        setTableColor((tRow.color as string | null) ?? null)

        if ((tRow.is_active ?? true) === false) {
          setError('This table is not active.')
          setMissionsEnabled(null)
          setLoading(false)
          return
        }

        setMissionsEnabled(enabled)

        try {
          const lb = await fetchLeaderboard()
          if (!cancelled) setLeaderboardRows(lb)
        } catch {
          if (!cancelled) setLeaderboardRows([])
        }

        if (enabled !== true) {
          setMissions([])
          setCompletedMissionIds(new Set())
          setPendingMissionIds(new Set())
          setSubmissionSlotsUsedByMission(new Map())
          setRejectedSubmissionByMissionId(new Map())
          setLoading(false)
          return
        }

        const [cRes, pRes, slotRes, aRes] = await Promise.all([
          supabase.from('completions').select('mission_id').eq('table_id', tableId),
          supabase
            .from('mission_submissions')
            .select('mission_id')
            .eq('table_id', tableId)
            .eq('status', 'pending'),
          supabase
            .from('mission_submissions')
            .select('mission_id')
            .eq('table_id', tableId)
            .in('status', ['pending', 'approved']),
          supabase
            .from('mission_assignments')
            .select('mission_id')
            .eq('table_id', tableId)
            .eq('is_active', true),
        ])

        const rRes = await supabase
          .from('mission_submissions')
          .select('mission_id, review_note, submission_data')
          .eq('table_id', tableId)
          .eq('status', 'rejected')
          .order('created_at', { ascending: false })
          .limit(200)

        if (cancelled) return

        if (aRes.error)
          throw new Error(`mission_assignments: ${aRes.error.message}`)
        if (cRes.error) throw new Error(`completions: ${cRes.error.message}`)
        if (pRes.error)
          throw new Error(`mission_submissions(pending): ${pRes.error.message}`)
        if (slotRes.error)
          throw new Error(`mission_submissions(slots): ${slotRes.error.message}`)
        if (rRes.error)
          throw new Error(`mission_submissions(rejected): ${rRes.error.message}`)

        const assignedMissionIds = ((aRes.data ?? []) as PendingRow[]).map(
          (r) => r.mission_id
        )

        if (assignedMissionIds.length === 0) {
          setMissions([])
        } else {
          const { data: mRes, error: mErr } = await supabase
            .from('missions')
            .select(
              'id,title,description,points,points_per_submission,validation_type,approval_mode,is_active,allow_multiple_submissions,max_submissions_per_table,message_required,target_person_name,submission_hint,header_title,header_image_url,card_theme_index,card_cover_image_url,success_message,card_cta_label,card_completed_label'
            )
            .in('id', assignedMissionIds)
            .eq('is_active', true)
            .order('title')

          if (mErr) throw new Error(`missions: ${mErr.message}`)

          const ms = (mRes ?? []) as Array<{
            id: string
            title: string
            description: string | null
            points: number
            points_per_submission?: number | null
            validation_type: string | null
            approval_mode?: string | null
            is_active: boolean
            allow_multiple_submissions?: boolean
            max_submissions_per_table?: number | null
            message_required?: boolean
            target_person_name?: string | null
            submission_hint?: string | null
            header_title?: string | null
            header_image_url?: string | null
            card_theme_index?: number | null
            card_cover_image_url?: string | null
            success_message?: string | null
            card_cta_label?: string | null
            card_completed_label?: string | null
          }>

          const activeMs: MissionRow[] = ms.map((m) => ({
            id: m.id as string,
            title: m.title as string,
            description: m.description ?? null,
            points: Number(m.points) || 0,
            points_per_submission:
              m.points_per_submission == null || m.points_per_submission === undefined
                ? null
                : Math.max(0, Math.floor(Number(m.points_per_submission))),
            validation_type: normalizeMissionValidationType(
              m.validation_type as string | null | undefined
            ),
            is_active: m.is_active ?? true,
            approval_mode:
              String(m.approval_mode ?? 'manual') === 'auto' ? 'auto' : 'manual',
            allow_multiple_submissions: m.allow_multiple_submissions ?? false,
            max_submissions_per_table:
              m.max_submissions_per_table === undefined || m.max_submissions_per_table === null
                ? null
                : Math.max(1, Math.floor(Number(m.max_submissions_per_table))),
            message_required: m.message_required ?? false,
            target_person_name: m.target_person_name ?? null,
            submission_hint: m.submission_hint ?? null,
            header_title: m.header_title ?? null,
            header_image_url: m.header_image_url ?? null,
            card_theme_index:
              m.card_theme_index == null
                ? null
                : Math.max(0, Math.min(5, Math.floor(Number(m.card_theme_index)))),
            card_cover_image_url: m.card_cover_image_url ?? null,
            success_message: m.success_message ?? null,
            card_cta_label: m.card_cta_label ?? null,
            card_completed_label: m.card_completed_label ?? null,
          }))
          setMissions(activeMs)
        }

        const completed = ((cRes.data ?? []) as CompletionRow[]).map(
          (r) => r.mission_id
        )
        setCompletedMissionIds(new Set(completed))

        const pending = ((pRes.data ?? []) as PendingRow[]).map(
          (r) => r.mission_id
        )
        setPendingMissionIds(new Set(pending))

        const slotRows = (slotRes.data ?? []) as ApprovedRow[]
        const slotMap = new Map<string, number>()
        for (const r of slotRows) {
          slotMap.set(r.mission_id, (slotMap.get(r.mission_id) ?? 0) + 1)
        }
        setSubmissionSlotsUsedByMission(slotMap)

        const rejectedMap = new Map<
          string,
          {
            note: string | null
            submissionData: { image_url?: string; signature_image_url?: string } | null
          }
        >()
        const rejectedRows = (rRes.data ?? []) as Array<{
          mission_id: string
          review_note?: string | null
          submission_data?: {
            image_url?: string | null
            signature_image_url?: string | null
          } | null
        }>
        for (const row of rejectedRows) {
          if (rejectedMap.has(row.mission_id)) continue
          rejectedMap.set(row.mission_id, {
            note: (row.review_note as string | null) ?? null,
            submissionData: row.submission_data
              ? {
                  image_url: row.submission_data.image_url ?? undefined,
                  signature_image_url:
                    row.submission_data.signature_image_url ?? undefined,
                }
              : null,
          })
        }
        setRejectedSubmissionByMissionId(rejectedMap)
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : typeof e === 'string'
                ? e
                : JSON.stringify(e)
          )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tableId])

  const statusFor = useMemo(() => {
    const completed = completedMissionIds
    const pending = pendingMissionIds
    const slots = submissionSlotsUsedByMission
    return (
      missionId: string,
      mission?: MissionRow
    ): 'available' | 'pending' | 'completed' | 'limit_reached' => {
      const used = slots.get(missionId) ?? 0
      const repeatable = mission
        ? isRepeatableAutoMission({
            approval_mode: mission.approval_mode ?? 'manual',
            max_submissions_per_table: mission.max_submissions_per_table,
            allow_multiple_submissions: mission.allow_multiple_submissions,
          })
        : false
      if (repeatable) {
        if (mission && isAtSubmissionLimit(mission, used)) return 'limit_reached'
        return 'available'
      }
      if (completed.has(missionId)) return 'completed'
      if (pending.has(missionId)) return 'pending'
      if (mission && isAtSubmissionLimit(mission, used)) return 'limit_reached'
      return 'available'
    }
  }, [completedMissionIds, pendingMissionIds, submissionSlotsUsedByMission])

  const orderedMissions = useMemo(() => {
    const withMeta = missions.map((mission, index) => {
      const status = statusFor(mission.id, mission)
      const priority = status === 'completed' ? 2 : status === 'pending' ? 1 : 0
      return { mission, index, priority }
    })
    withMeta.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.index - b.index
    })
    return withMeta.map((entry) => entry.mission)
  }, [missions, statusFor])

  const missionSectionProgress = useMemo(() => {
    if (missions.length === 0) return null
    const done = missions.filter((m) => {
      const s = statusFor(m.id, m)
      return s === 'completed' || s === 'limit_reached'
    }).length
    return { done, total: missions.length }
  }, [missions, statusFor])

  async function openMissionModal(
    missionId: string,
    opts?: { skipHydrate?: boolean; fromHero?: boolean }
  ) {
    setMissionOverlayVariant(
      opts?.fromHero === true ? 'hero-greeting' : 'missions-section'
    )
    setSelectedMissionId(missionId)
    setModalExistingPhotoUrl(null)
    setModalIsRejected(false)
    setModalRejectedNote(null)
    if (opts?.skipHydrate) {
      return
    }
    const mission = missions.find((m) => m.id === missionId)
    const st = statusFor(missionId, mission)
    if (st === 'pending') {
      const { data } = await supabase
        .from('mission_submissions')
        .select('submission_data')
        .eq('table_id', tableId)
        .eq('mission_id', missionId)
        .eq('status', 'pending')
        .limit(1)
      const row = (data ?? [])[0] as {
        submission_data?: { image_url?: string | null; signature_image_url?: string | null }
      } | undefined
      const sd = row?.submission_data ?? null
      const url =
        mission?.validation_type === 'signature'
          ? (sd as { signature_image_url?: string | null })?.signature_image_url ?? null
          : (sd as { image_url?: string | null })?.image_url ?? null
      if (typeof url === 'string' && url.length > 0) setModalExistingPhotoUrl(url)
    } else {
      if (st === 'completed') return
      if (st === 'limit_reached') return

      const isRepeatableAuto = mission
        ? isRepeatableAutoMission({
            approval_mode: mission.approval_mode ?? 'manual',
            max_submissions_per_table: mission.max_submissions_per_table,
            allow_multiple_submissions: mission.allow_multiple_submissions,
          })
        : false
      const slotsUsed = submissionSlotsUsedByMission.get(missionId) ?? 0
      if (isRepeatableAuto && slotsUsed > 0) return

      const rejected = rejectedSubmissionByMissionId.get(missionId)
      if (rejected) {
        setModalIsRejected(true)
        setModalRejectedNote(rejected.note)
        const sd = rejected.submissionData
        const url =
          mission?.validation_type === 'signature'
            ? sd?.signature_image_url ?? null
            : sd?.image_url ?? null
        if (typeof url === 'string' && url.length > 0) setModalExistingPhotoUrl(url)
      }
    }
  }

  const showMissionUi = missionsEnabled === true && !error

  const navHighlightColor = teamPage.theme.primaryColor

  return (
    <main className="min-h-screen w-full min-w-0 max-w-full overflow-x-hidden bg-white">
      <div id="section-hero">
        <MissionsTableHero
          loading={loading}
          tableName={tableName}
          tableColor={tableColor}
          tableRank={tableRank}
          totalTeams={totalTeams}
          tablePoints={tablePoints}
          heroBackgroundCss={heroBackgroundStyle(teamPage).background}
          heroImageSrc={teamPage.hero.heroImage.url}
          teamSubcopy={teamPage.hero.teamText}
          heroTeamEmblemUrl={heroTeamEmblemUrl}
          heroRankEmblemUrl={heroRankEmblemUrl}
          missionsEnabled={missionsEnabled}
          missionCount={missions.length}
          onStartMission={scrollToQuests}
          onSendGreeting={() => {
            if (greetingMissionId) {
              setMissionOverlayVariant('hero-greeting')
              setMissionModalReset((n) => n + 1)
              void openMissionModal(greetingMissionId, { skipHydrate: true })
            } else {
              scrollToQuests()
            }
          }}
        />
      </div>

      {loading && showMissionUi ? (
        <section className="w-full pt-8" aria-busy="true">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="px-5 text-left text-2xl font-semibold leading-snug text-zinc-900">
              Complete missions
            </h2>
            <div className="flex shrink-0 gap-1.5 px-5">
              <div className="h-10 w-10 animate-pulse rounded-full bg-violet-100" />
              <div className="h-10 w-10 animate-pulse rounded-full bg-violet-100" />
            </div>
          </div>
          <div className="flex gap-4 overflow-hidden pb-2 pl-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[min(420px,62vh)] w-[min(300px,78vw)] shrink-0 snap-start animate-pulse rounded-3xl"
                style={{ background: MISSION_CARD_SKELETON_BACKGROUND }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {showMissionUi && !loading ? (
        <section
          id="missions"
          ref={questsRef}
          className="w-full min-w-0 max-w-full scroll-mt-8 pt-8 pb-2"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pr-6">
            <h2 className="text-left text-2xl font-semibold leading-snug text-zinc-900">
              Complete missions
            </h2>
            {missionSectionProgress ? (
              <span
                className="shrink-0 inline-flex items-center gap-1.5 text-base font-semibold tabular-nums tracking-tight text-zinc-600"
                aria-label={`${missionSectionProgress.done} of ${missionSectionProgress.total} missions completed, ${tablePoints} ${rewardUnitCompactLabel(rewardUnit)}`}
              >
                {missionSectionProgress.done}/{missionSectionProgress.total} completed ·{' '}
                <RewardUnitIcon size={COIN_SIZE} displayVariant="onDark" />
                {tablePoints}
              </span>
            ) : null}
          </div>

          {!missions.length ? (
            <p className="px-5 pt-3 text-left text-sm font-medium text-violet-800/80">
              No missions for this table yet — check back soon.
            </p>
          ) : (
            <div className="w-full min-w-0 max-w-full overflow-x-hidden">
            <div
              ref={carouselRef}
              className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 pl-5 pr-6 [scroll-padding-left:1.25rem] [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
            >
              {orderedMissions.map((m, i) => {
                const st = statusFor(m.id, m)
                const completed = st === 'completed'
                const pending = st === 'pending'
                const limitReached = st === 'limit_reached'
                const surface = guestMissionSurfaceGradient(m, orderedMissions, i)
                const rewardAmount = guestMissionDisplayReward(m)
                const typeIcon = m.validation_type === 'video'
                  ? '🎥'
                  : m.validation_type === 'photo'
                    ? '📸'
                    : m.validation_type === 'signature'
                      ? '🖊️'
                      : m.validation_type === 'text'
                        ? '📝'
                        : '💬'
                const isTableGreetingCard = /post a table greeting/i.test(m.title)
                const isTrumpetStoryCard =
                  /get alex to explain the trumpet story/i.test(m.title)
                const customCardCover =
                  typeof m.card_cover_image_url === 'string' &&
                  m.card_cover_image_url.trim().length > 0 &&
                  !isTrumpetStoryCard &&
                  !isTableGreetingCard
                const ctaLabel = (m.card_cta_label ?? '').trim() || 'Start mission'
                const completedLabel =
                  (m.card_completed_label ?? '').trim() || 'Completed'

                return (
                  <button
                    key={m.id}
                    type="button"
                    data-mission-card
                    disabled={limitReached}
                    onClick={() => openMissionModal(m.id)}
                    className={`relative flex h-[min(420px,62vh)] w-[min(300px,78vw)] shrink-0 snap-start flex-col overflow-hidden rounded-3xl p-5 text-left transition active:scale-[0.99] ${limitReached ? 'opacity-95' : ''}`}
                    style={
                      isTrumpetStoryCard || isTableGreetingCard || customCardCover
                        ? undefined
                        : { background: surface }
                    }
                  >
                    {customCardCover ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
                        style={{
                          backgroundImage: `url(${m.card_cover_image_url})`,
                        }}
                      />
                    ) : isTrumpetStoryCard ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
                        style={{
                          backgroundImage: `url(${TRUMPET_STORY_CARD_ARTWORK_PATH})`,
                        }}
                      />
                    ) : isTableGreetingCard ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${TABLE_GREETING_ARTWORK_PATH})` }}
                      />
                    ) : null}
                    <span
                      className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg leading-none text-zinc-800"
                      aria-hidden
                    >
                      {m.validation_type === 'beatcoin' ? <RewardUnitIcon size={COIN_SIZE} /> : typeIcon}
                    </span>

                    <h3 className="relative z-10 pr-12 text-left text-lg font-bold leading-snug text-white">
                      {m.title}
                    </h3>
                    <p className="relative z-10 mt-2 text-left text-sm font-semibold tabular-nums text-white/95">
                      <span className="inline-flex items-center gap-1">
                        <RewardAmount
                          showPlus
                          amount={rewardAmount}
                          iconSize={COIN_SIZE}
                          className="text-white/95"
                          displayVariant="onDark"
                        />
                      </span>
                    </p>

                    {pending && !limitReached ? (
                      <p className="relative z-10 mt-2 text-left text-xs font-medium text-white/90">
                        Pending review
                      </p>
                    ) : null}

                    <div className="relative z-10 mt-3 w-full">
                      {completed ? (
                        <span className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm">
                          <svg
                            className="h-4 w-4 shrink-0 text-white"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {completedLabel}
                        </span>
                      ) : limitReached ? (
                        <span className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-center text-sm font-semibold text-black">
                          Done
                        </span>
                      ) : (
                        <span className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-center text-sm font-semibold text-black">
                          {ctaLabel}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            </div>
          )}
          {missions.length > 0 ? (
            <div className="mt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                aria-label="Previous mission"
                onClick={() => scrollMissionCarousel(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-white text-lg font-medium text-zinc-900 transition hover:bg-zinc-50 active:scale-95"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next mission"
                onClick={() => scrollMissionCarousel(1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-white text-lg font-medium text-zinc-900 transition hover:bg-zinc-50 active:scale-95"
              >
                ›
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mx-auto w-full min-w-0 max-w-lg space-y-16 px-5 pb-28 pt-6">
        <section id="feed" className="scroll-mt-8">
          {!loading && !error && missionsEnabled === true && tableName.trim() ? (
            <MissionSocialFeedSection
              items={missionFeedItems}
              loading={missionFeedLoading}
              sectionTitleColor={teamPage.typography.textColorPrimary}
            />
          ) : null}
        </section>

        {missionsEnabled === false ? (
          <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 px-5 py-5 text-center">
            <div className="text-base font-extrabold text-amber-900">Opening soon</div>
            <div className="mt-2 text-sm text-amber-800/90">
              Quests are paused — you can still share a greeting or peek at the display.
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/upload"
                className="rounded-full bg-amber-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-600"
              >
                Post a greeting
              </Link>
              <Link
                href="/play"
                className="rounded-full border-2 border-amber-300/80 bg-white px-5 py-3 text-sm font-bold text-amber-900 transition hover:bg-amber-50"
              >
                Back to lobby
              </Link>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl border-2 border-rose-200 bg-rose-50 px-5 py-4">
            <div className="text-sm font-extrabold text-rose-900">Something went wrong</div>
            <div className="mt-1 text-xs text-rose-800/90">{error}</div>
          </div>
        ) : null}

        <section id="seat-finder" className="scroll-mt-8">
          <h2
            className="text-left text-2xl font-semibold leading-snug text-zinc-900"
            style={{ color: teamPage.typography.textColorPrimary }}
          >
            Find your people
          </h2>
          <p
            className="mt-1 text-base text-zinc-500"
            style={{ color: teamPage.typography.textColorSecondary }}
          >
            Search your name or explore the tables
          </p>
          <div className="mt-3 min-h-0">
            <SeatingMapPanel
              layout="embedded"
              showSectionHeading={false}
              className="w-full"
              viewerAccentColor={teamPage.theme.primaryColor}
            />
          </div>
        </section>

        <section id="leaderboard" className="scroll-mt-8">
          <h2
            className="text-left text-2xl font-semibold leading-snug text-zinc-900"
            style={{ color: teamPage.typography.textColorPrimary }}
          >
            Leaderboard
          </h2>
          <p
            className="mt-1 text-base text-zinc-500"
            style={{ color: teamPage.typography.textColorSecondary }}
          >
            {leaderboardMotivation.kind === 'close_chase' ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                <span>⚠️ Only</span>
                <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums">
                  {leaderboardMotivation.delta}
                  <RewardUnitIcon size={14} />
                </span>
                <span>coins to reach</span>
                <span className="inline-flex items-center gap-1 font-semibold">
                  {leaderboardMotivation.targetRankEmblemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={leaderboardMotivation.targetRankEmblemUrl}
                      alt=""
                      className="h-5 w-5 rounded object-contain"
                    />
                  ) : null}
                  #{leaderboardMotivation.targetRank}
                </span>
              </span>
            ) : leaderboardMotivation.kind === 'chase' ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                <span>You need</span>
                <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums">
                  {leaderboardMotivation.delta}
                  <RewardUnitIcon size={14} />
                </span>
                <span>coins to overtake</span>
                <span className="inline-flex items-center gap-1 font-semibold">
                  {leaderboardMotivation.targetRankEmblemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={leaderboardMotivation.targetRankEmblemUrl}
                      alt=""
                      className="h-5 w-5 rounded object-contain"
                    />
                  ) : null}
                  #{leaderboardMotivation.targetRank}
                </span>
              </span>
            ) : leaderboardMotivation.kind === 'leading' ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                <span>You&apos;re leading by</span>
                <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums">
                  {leaderboardMotivation.delta}
                  <RewardUnitIcon size={14} />
                </span>
                <span>coins — increase the gap!</span>
                {leaderboardMotivation.targetRankEmblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={leaderboardMotivation.targetRankEmblemUrl}
                    alt=""
                    className="h-5 w-5 rounded object-contain"
                  />
                ) : null}
              </span>
            ) : (
              'Keep earning coins to climb the leaderboard'
            )}
          </p>

          {leaderboardPreview.length > 0 ? (
            <>
              <ul className="mt-3 flex w-full flex-col gap-3">
                {leaderboardPreview.map((row, i) => {
                  const isYou = row.tableId === tableId
                  const pointsShown = safeRewardPoints(row.totalPoints)
                  return (
                    <li
                      key={row.tableId}
                      className="flex items-center justify-between gap-3 rounded-md px-3 py-3 text-sm"
                      style={{
                        background: leaderboardRowFill(row.tableColor, teamPage),
                        ...(isYou
                          ? {
                              boxShadow:
                                '0 0 0 1px rgba(255,255,255,0.38), inset 0 0 0 1px rgba(255,255,255,0.22), 0 0 36px rgba(255,255,255,0.16)',
                            }
                          : {}),
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2.5 font-bold text-white">
                        <span className="tabular-nums text-white">{i + 1}.</span>
                        <div
                          className="h-8 w-8 shrink-0 rounded-full border border-white/35 bg-white/20"
                          aria-hidden
                        />
                        <span className="truncate">{row.tableName}</span>
                        {isYou ? (
                          <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-extrabold text-white">
                            You
                          </span>
                        ) : null}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 font-extrabold tabular-nums text-white">
                        <RewardUnitIcon
                          size={COIN_SIZE}
                          displayVariant="onDark"
                          tintColor={teamPage.theme.iconColor}
                        />
                        {pointsShown}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-4 flex w-full justify-center">
                <button
                  type="button"
                  onClick={() => scrollToQuests()}
                  className="inline-flex w-[min(300px,78vw)] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
                  style={{ backgroundColor: teamPage.theme.primaryColor }}
                >
                  <RewardUnitIcon
                    size={COIN_SIZE}
                    displayVariant="onDark"
                    tintColor="#ffffff"
                  />
                  Earn more coins
                </button>
              </div>
              <div className="mt-4">
                <h3
                  className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
                  style={{ color: teamPage.typography.textColorSecondary }}
                >
                  Momentum feed
                </h3>
                {momentumFeed.length === 0 ? (
                  <p
                    className="mt-2 text-xs text-zinc-500"
                    style={{ color: teamPage.typography.textColorSecondary }}
                  >
                    No recent scoring activity yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {momentumFeed.map((item, idx) => (
                      <li
                        key={item.id}
                        className={`rounded-lg border border-zinc-200/80 bg-white/80 px-3 py-2 text-xs ${
                          momentumEnterIds.has(item.id)
                            ? 'motion-safe:animate-[fadeIn_0.45s_ease-out]'
                            : ''
                        } ${idx >= 5 ? 'opacity-70' : idx >= 3 ? 'opacity-85' : 'opacity-100'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: item.tableColor ?? '#a1a1aa' }}
                              aria-hidden
                            />
                            <span className="truncate text-zinc-700">{item.message}</span>
                          </span>
                          {item.coinChange > 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold tabular-nums text-zinc-700">
                              +{item.coinChange}
                              <RewardUnitIcon size={12} />
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="mt-3">
              <p
                className="text-sm font-medium text-zinc-600"
                style={{ color: teamPage.typography.textColorSecondary }}
              >
                No leaderboard data yet.
              </p>
            </div>
          )}
        </section>

        {selectedMissionId
          ? (() => {
              const m = orderedMissions.find((x) => x.id === selectedMissionId)
              if (!m) return null
              const selectedIdx = orderedMissions.findIndex((x) => x.id === selectedMissionId)
              const hasNav = orderedMissions.length > 1 && selectedIdx >= 0
              const missionGradient = guestMissionSurfaceGradient(
                m,
                orderedMissions,
                selectedIdx >= 0 ? selectedIdx : 0
              )
              const nextRankTarget =
                tableRank != null && tableRank > 1 ? tableRank - 1 : null
              const teamAbove =
                tableRank != null && tableRank > 1
                  ? leaderboardRows[tableRank - 2]
                  : undefined
              const missionRewardGuest = guestMissionDisplayReward(m)
              const missionCouldReachNextRank = Boolean(
                teamAbove != null &&
                  tablePoints + missionRewardGuest >=
                    safeRewardPoints(teamAbove.totalPoints)
              )
              const isTableGreetingMission = /post a table greeting/i.test(m.title)
              const isTrumpetStoryMission =
                /get alex to explain the trumpet story/i.test(m.title)
              const rankEmblemUrl = resolveRankEmblemUrl(
                guestEmblems,
                tableRank ?? null
              )
              const nextRankEmblemUrl =
                missionCouldReachNextRank && nextRankTarget != null
                  ? resolveRankEmblemUrl(guestEmblems, nextRankTarget)
                  : null
              const teamEmblemUrl =
                guestEmblems.team_emblem_by_table_id?.[tableId] ?? null

              const missionForModal: MissionForModal = {
                id: m.id,
                title: m.title,
                description: m.description,
                points: m.points,
                points_per_submission: m.points_per_submission ?? null,
                validation_type: m.validation_type,
                target_person_name: m.target_person_name ?? null,
                submission_hint: m.submission_hint ?? null,
                header_title: m.header_title ?? null,
                /** Used for circular mission image in white content area. */
                header_image_url: isTrumpetStoryMission
                  ? TRUMPET_STORY_CARD_ARTWORK_PATH
                  : isTableGreetingMission
                    ? TABLE_GREETING_ARTWORK_PATH
                    : (m.header_image_url ?? null),
                approval_mode: m.approval_mode ?? 'manual',
                allow_multiple_submissions: m.allow_multiple_submissions ?? false,
                max_submissions_per_table: m.max_submissions_per_table ?? null,
                message_required: m.message_required ?? false,
                success_message: m.success_message ?? null,
              }
              return (
                <MissionModal
                  key={m.id}
                  mission={missionForModal}
                  tableId={tableId}
                  tableName={tableName}
                  tableColor={tableColor}
                  isPending={statusFor(m.id, m) === 'pending'}
                  isCompleted={statusFor(m.id, m) === 'completed'}
                  atSubmissionLimit={statusFor(m.id, m) === 'limit_reached'}
                  isRejected={modalIsRejected}
                  rejectedNote={modalRejectedNote}
                  submissionSlotsUsed={submissionSlotsUsedByMission.get(m.id) ?? 0}
                  existingPhotoUrl={modalExistingPhotoUrl}
                  missionsEnabled={missionsEnabled === true}
                  missionGradient={missionGradient}
                  rewardHud={{
                    teamPoints: tablePoints,
                    rank: tableRank,
                    totalTeams,
                    missionCouldReachNextRank,
                    nextRankTarget,
                  }}
                  nextRankEmblemUrl={nextRankEmblemUrl}
                  hudEmblems={{
                    teamEmblemUrl,
                    rankEmblemUrl,
                  }}
                  onClose={() => setSelectedMissionId(null)}
                  onPrev={
                    missionOverlayVariant === 'hero-greeting' && hasNav
                      ? () =>
                          setSelectedMissionId(
                            orderedMissions[
                              (selectedIdx - 1 + orderedMissions.length) %
                                orderedMissions.length
                            ]!.id
                          )
                      : undefined
                  }
                  onNext={
                    missionOverlayVariant === 'hero-greeting' && hasNav
                      ? () =>
                          setSelectedMissionId(
                            orderedMissions[(selectedIdx + 1) % orderedMissions.length]!.id
                          )
                      : undefined
                  }
                  onSuccess={refreshTableData}
                  resetSignal={missionModalReset}
                  overlayVariant={missionOverlayVariant}
                />
              )
            })()
          : null}

      </div>

      <StickySectionNav
        heroContainerId="section-hero"
        highlightColor={navHighlightColor}
        items={[
          {
            id: 'missions',
            label: 'Missions',
            targetId: 'missions',
            activeIconSrc: '/nav/MissionW.svg',
            inactiveIconSrc: '/nav/MissionC.svg',
            iconAlt: 'Missions',
          },
          {
            id: 'feed',
            label: 'Feed',
            targetId: 'feed',
            activeIconSrc: '/nav/HeartW.svg',
            inactiveIconSrc: '/nav/HeartC.svg',
            iconAlt: 'Feed',
          },
          {
            id: 'seat',
            label: 'Seat finder',
            targetId: 'seat-finder',
            activeIconSrc: '/nav/PinW.svg',
            inactiveIconSrc: '/nav/PinC.svg',
            iconAlt: 'Seat finder',
          },
          {
            id: 'leaderboard',
            label: 'Leaderboard',
            targetId: 'leaderboard',
            activeIconSrc: '/nav/BarW.svg',
            inactiveIconSrc: '/nav/BarC.svg',
            iconAlt: 'Leaderboard',
          },
        ]}
      />
    </main>
  )
}
