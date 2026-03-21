'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GreetingsStripSection } from '@/components/guest/GreetingsStripSection'
import { MissionsTableHero } from '@/components/guest/MissionsTableHero'
import { getMissionsEnabled } from '@/lib/app-settings'
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/leaderboard'
import {
  normalizeMissionValidationType,
  type MissionValidationType,
} from '@/lib/mission-validation-type'
import type { GreetingRow } from '@/lib/greetings-admin'
import { listReadyGreetingsNewestFirst } from '@/lib/greetings-guest'
import { supabase } from '@/lib/supabase/client'
import { MissionModal, type MissionForModal } from './MissionModal'
import {
  MISSION_CARD_BACKGROUNDS,
  MISSION_CARD_SKELETON_BACKGROUND,
} from '@/lib/guest-missions-gradients'

const GREETINGS_FEED_LIMIT = 80

type TableIdParams = { tableId: string }

type MissionRow = {
  id: string
  title: string
  description: string | null
  points: number
  validation_type: MissionValidationType
  is_active: boolean
  approval_mode?: 'auto' | 'manual'
  allow_multiple_submissions?: boolean
  message_required?: boolean
  target_person_name?: string | null
  submission_hint?: string | null
  header_title?: string | null
  header_image_url?: string | null
  created_at?: string
}

type CompletionRow = { mission_id: string }
type PendingRow = { mission_id: string }
type ApprovedRow = { mission_id: string }

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
  const router = useRouter()
  const questsRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)

  const [missionsEnabled, setMissionsEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tableName, setTableName] = useState<string>('')
  const [tableColor, setTableColor] = useState<string | null>(null)
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
  const [modalExistingPhotoUrl, setModalExistingPhotoUrl] = useState<string | null>(null)
  const [modalIsRejected, setModalIsRejected] = useState(false)
  const [modalRejectedNote, setModalRejectedNote] = useState<string | null>(null)
  const [approvedSubmissionCountByMission, setApprovedSubmissionCountByMission] =
    useState<Map<string, number>>(new Map())

  const [greetingsFeed, setGreetingsFeed] = useState<GreetingRow[]>([])
  const [greetingsLoading, setGreetingsLoading] = useState(false)

  const { tablePoints, tableRank, totalTeams } = useMemo(() => {
    const idx = leaderboardRows.findIndex((e) => e.tableId === tableId)
    return {
      tablePoints: idx >= 0 ? leaderboardRows[idx].totalPoints : 0,
      tableRank: idx >= 0 ? idx + 1 : null,
      totalTeams: leaderboardRows.length,
    }
  }, [leaderboardRows, tableId])

  const leaderboardPreview = useMemo(
    () => leaderboardRows.slice(0, 4),
    [leaderboardRows]
  )

  const scrollToQuests = () => {
    questsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

  const refreshTableData = useCallback(() => {
    void (async () => {
      try {
        const lb = await fetchLeaderboard()
        setLeaderboardRows(lb)
      } catch {
        /* keep previous leaderboard */
      }

      const [cRes, pRes, apRes, rRes] = await Promise.all([
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
          .eq('status', 'approved'),
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
      const approvedRows = (apRes.data ?? []) as ApprovedRow[]
      const approvedMap = new Map<string, number>()
      for (const r of approvedRows)
        approvedMap.set(r.mission_id, (approvedMap.get(r.mission_id) ?? 0) + 1)
      setApprovedSubmissionCountByMission(approvedMap)

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
    })()
  }, [tableId])

  useEffect(() => {
    if (loading || !tableName.trim()) {
      if (!loading && !tableName.trim()) {
        setGreetingsFeed([])
        setGreetingsLoading(false)
      }
      return
    }
    let cancelled = false
    setGreetingsLoading(true)
    listReadyGreetingsNewestFirst(GREETINGS_FEED_LIMIT)
      .then((data) => {
        if (!cancelled) setGreetingsFeed(data)
      })
      .catch(() => {
        if (!cancelled) setGreetingsFeed([])
      })
      .finally(() => {
        if (!cancelled) setGreetingsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loading, tableName, tableId])

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
            .select('name,color,is_active,is_archived')
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
        } | null

        if (!tRow) {
          setError('Table not found.')
          setLoading(false)
          return
        }

        if ((tRow.is_archived ?? false) === true) {
          setTableName((tRow.name as string) ?? '')
          setTableColor((tRow.color as string | null) ?? null)
          setMissionsEnabled(enabled)
          setError('This team has been archived. Choose another table from the list.')
          setLoading(false)
          return
        }

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
          setApprovedSubmissionCountByMission(new Map())
          setRejectedSubmissionByMissionId(new Map())
          setLoading(false)
          return
        }

        const [cRes, pRes, apRes, aRes] = await Promise.all([
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
            .eq('status', 'approved'),
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
        if (apRes.error)
          throw new Error(`mission_submissions(approved): ${apRes.error.message}`)
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
              'id,title,description,points,validation_type,approval_mode,is_active,allow_multiple_submissions,message_required,target_person_name,submission_hint,header_title,header_image_url'
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
            validation_type: string | null
            approval_mode?: string | null
            is_active: boolean
            allow_multiple_submissions?: boolean
            message_required?: boolean
            target_person_name?: string | null
            submission_hint?: string | null
            header_title?: string | null
            header_image_url?: string | null
          }>

          const activeMs: MissionRow[] = ms.map((m) => ({
            id: m.id as string,
            title: m.title as string,
            description: m.description ?? null,
            points: Number(m.points) || 0,
            validation_type: normalizeMissionValidationType(
              m.validation_type as string | null | undefined
            ),
            is_active: m.is_active ?? true,
            approval_mode:
              String(m.approval_mode ?? 'manual') === 'auto' ? 'auto' : 'manual',
            allow_multiple_submissions: m.allow_multiple_submissions ?? false,
            message_required: m.message_required ?? false,
            target_person_name: m.target_person_name ?? null,
            submission_hint: m.submission_hint ?? null,
            header_title: m.header_title ?? null,
            header_image_url: m.header_image_url ?? null,
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

        const approvedRows = (apRes.data ?? []) as ApprovedRow[]
        const approvedMap = new Map<string, number>()
        for (const r of approvedRows) {
          approvedMap.set(r.mission_id, (approvedMap.get(r.mission_id) ?? 0) + 1)
        }
        setApprovedSubmissionCountByMission(approvedMap)

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
    return (
      missionId: string,
      mission?: MissionRow
    ): 'available' | 'pending' | 'completed' => {
      const isRepeatableAuto =
        mission?.allow_multiple_submissions === true && mission?.approval_mode === 'auto'
      if (isRepeatableAuto) return 'available'
      if (completed.has(missionId)) return 'completed'
      if (pending.has(missionId)) return 'pending'
      return 'available'
    }
  }, [completedMissionIds, pendingMissionIds])

  async function openMissionModal(missionId: string) {
    setSelectedMissionId(missionId)
    setModalExistingPhotoUrl(null)
    setModalIsRejected(false)
    setModalRejectedNote(null)
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

      const isRepeatableAuto =
        mission?.allow_multiple_submissions === true && mission?.approval_mode === 'auto'
      const repeatCount = approvedSubmissionCountByMission.get(missionId) ?? 0
      if (isRepeatableAuto && repeatCount > 0) return

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

  return (
    <main className="min-h-screen bg-white">
      <MissionsTableHero
        loading={loading}
        tableName={tableName}
        tableColor={tableColor}
        tableRank={tableRank}
        totalTeams={totalTeams}
        tablePoints={tablePoints}
        missionsEnabled={missionsEnabled}
        missionCount={missions.length}
        onStartMission={scrollToQuests}
      />

      {loading && showMissionUi ? (
        <section className="mx-auto w-full max-w-lg px-5 pt-8" aria-busy="true">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-left text-lg font-semibold leading-snug text-zinc-900">
              Earn points, complete missions
            </h2>
            <div className="flex shrink-0 gap-1.5">
              <div className="h-10 w-10 animate-pulse rounded-full bg-violet-100" />
              <div className="h-10 w-10 animate-pulse rounded-full bg-violet-100" />
            </div>
          </div>
          <div className="flex gap-4 overflow-hidden pb-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[min(560px,82vh)] w-[min(300px,78vw)] shrink-0 snap-start animate-pulse rounded-3xl"
                style={{ background: MISSION_CARD_SKELETON_BACKGROUND }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {showMissionUi && !loading ? (
        <section
          id="table-quests"
          ref={questsRef}
          className="mx-auto w-full max-w-lg scroll-mt-8 px-5 pt-8 pb-2"
        >
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-left text-lg font-semibold leading-snug text-zinc-900">
              Earn points, complete missions
            </h2>
            {missions.length > 0 ? (
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  aria-label="Previous mission"
                  onClick={() => scrollMissionCarousel(-1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-200/90 bg-white text-lg font-medium text-violet-700 transition hover:bg-violet-50 active:scale-95"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next mission"
                  onClick={() => scrollMissionCarousel(1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-200/90 bg-white text-lg font-medium text-violet-700 transition hover:bg-violet-50 active:scale-95"
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>

          {!missions.length ? (
            <p className="text-left text-sm font-medium text-violet-800/80">
              No missions for this table yet — check back soon.
            </p>
          ) : (
            <div
              ref={carouselRef}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 pr-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {missions.map((m, i) => {
                const st = statusFor(m.id, m)
                const completed = st === 'completed'
                const pending = st === 'pending'
                const surface =
                  MISSION_CARD_BACKGROUNDS[i % MISSION_CARD_BACKGROUNDS.length]

                return (
                  <button
                    key={m.id}
                    type="button"
                    data-mission-card
                    onClick={() => openMissionModal(m.id)}
                    className="relative flex h-[min(560px,82vh)] w-[min(300px,78vw)] shrink-0 snap-start flex-col overflow-hidden rounded-3xl p-5 text-left transition active:scale-[0.99]"
                    style={{ background: surface }}
                  >
                    <span
                      className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg leading-none text-zinc-800"
                      aria-hidden
                    >
                      {completed ? '✓' : pending ? '⏳' : '○'}
                    </span>

                    <h3 className="pr-12 text-left text-lg font-bold leading-snug text-white">
                      {m.title}
                    </h3>
                    <p className="mt-2 text-left text-sm font-semibold tabular-nums text-white/95">
                      +{m.points} pts
                    </p>

                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 pb-6 pt-8">
                      {completed || pending ? (
                        <span className="rounded-[9999px] bg-white/92 px-4 py-1.5 text-center text-xs font-medium text-zinc-800">
                          {completed ? 'Completed' : 'Pending review'}
                        </span>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      <div className="mx-auto w-full max-w-lg space-y-6 px-5 pb-28 pt-6">
        {!loading && !error && tableName.trim() ? (
          <GreetingsStripSection
            items={greetingsFeed}
            loading={greetingsLoading}
            viewAllHref="/greetings"
          />
        ) : null}

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

        {!loading && !error && missionsEnabled === true ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/upload"
                className="flex items-center gap-3 rounded-3xl border-2 border-violet-200/80 bg-white p-4 transition active:scale-[0.99] hover:border-violet-300"
              >
                <span className="text-2xl" aria-hidden>
                  💌
                </span>
                <div className="min-w-0">
                  <p className="font-extrabold text-violet-950">Greeting</p>
                  <p className="text-xs font-medium text-violet-600/80">Photo or message</p>
                </div>
              </Link>
              <Link
                href="/seat"
                className="flex items-center gap-3 rounded-3xl border-2 border-teal-200/80 bg-white p-4 transition active:scale-[0.99] hover:border-teal-300"
              >
                <span className="text-2xl" aria-hidden>
                  🪑
                </span>
                <div className="min-w-0">
                  <p className="font-extrabold text-teal-950">Seat finder</p>
                  <p className="text-xs font-medium text-teal-700/80">Your assignment</p>
                </div>
              </Link>
            </div>

            {leaderboardPreview.length > 0 ? (
              <section className="rounded-3xl border-2 border-violet-100 bg-white/90 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold text-violet-950">Leaderboard snapshot</h2>
                  <Link
                    href="/display"
                    className="text-xs font-bold text-violet-600 underline-offset-2 hover:underline"
                  >
                    Full board
                  </Link>
                </div>
                <ul className="mt-4 space-y-2">
                  {leaderboardPreview.map((row, i) => {
                    const isYou = row.tableId === tableId
                    return (
                      <li
                        key={row.tableId}
                        className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-xs ${
                          isYou
                            ? 'border-violet-300 bg-violet-50'
                            : 'border-violet-100 bg-violet-50/40'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2 font-bold text-violet-950">
                          <span className="tabular-nums text-violet-400">{i + 1}.</span>
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-violet-200"
                            style={{
                              backgroundColor: row.tableColor || '#8b5cf6',
                            }}
                          />
                          <span className="truncate">{row.tableName}</span>
                          {isYou ? (
                            <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                              You
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-extrabold tabular-nums text-violet-800">
                          {row.totalPoints} pts
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {selectedMissionId
          ? (() => {
              const m = missions.find((x) => x.id === selectedMissionId)
              if (!m) return null
              const missionForModal: MissionForModal = {
                id: m.id,
                title: m.title,
                description: m.description,
                points: m.points,
                validation_type: m.validation_type,
                target_person_name: m.target_person_name ?? null,
                submission_hint: m.submission_hint ?? null,
                header_title: m.header_title ?? null,
                header_image_url: m.header_image_url ?? null,
                approval_mode: m.approval_mode ?? 'manual',
                allow_multiple_submissions: m.allow_multiple_submissions ?? false,
                message_required: m.message_required ?? false,
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
                  isRejected={modalIsRejected}
                  rejectedNote={modalRejectedNote}
                  submittedCount={approvedSubmissionCountByMission.get(m.id) ?? 0}
                  existingPhotoUrl={modalExistingPhotoUrl}
                  missionsEnabled={missionsEnabled === true}
                  onClose={() => setSelectedMissionId(null)}
                  onSuccess={refreshTableData}
                />
              )
            })()
          : null}

        {showMissionUi && !loading && !error ? (
          <p className="pb-6 text-center text-xs font-medium text-violet-400">
            Need a different table? Tap <span className="font-bold text-violet-600">Switch table</span> in the hero.
          </p>
        ) : null}
      </div>
    </main>
  )
}
