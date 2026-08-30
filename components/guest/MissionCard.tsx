'use client'

import { RewardAmount } from '@/components/reward/RewardAmount'
import { MissionCategoryTypeIcon } from '@/components/mission/MissionCategoryTypeIcon'
import { COIN_SIZE } from '@/lib/mission-ui'
import { guestMissionDisplayReward } from '@/lib/mission-limits'
import {
  TABLE_GREETING_ARTWORK_PATH,
  TRUMPET_STORY_CARD_ARTWORK_PATH,
  guestMissionSurfaceGradient,
} from '@/lib/guest-missions-gradients'
import { resolveMissionCoverImageUrl } from '@/lib/missions-schema'
import type { GuestMissionRow } from '@/lib/missions'

export type MissionCardStatus = 'completed' | 'pending' | 'limit_reached' | 'available'

export type MissionCardProps = {
  mission: GuestMissionRow
  missionIndex: number
  allMissions: GuestMissionRow[]
  status: MissionCardStatus
  onOpen: () => void
}

function legacyCardArtworkFallback(mission: GuestMissionRow): string | null {
  if (/get alex to explain the trumpet story/i.test(mission.title)) {
    return TRUMPET_STORY_CARD_ARTWORK_PATH
  }
  if (/post a table greeting/i.test(mission.title)) {
    return TABLE_GREETING_ARTWORK_PATH
  }
  return null
}

export function MissionCard({
  mission,
  missionIndex,
  allMissions,
  status,
  onOpen,
}: MissionCardProps) {
  const completed = status === 'completed'
  const pending = status === 'pending'
  const limitReached = status === 'limit_reached'
  const surface = guestMissionSurfaceGradient(mission, allMissions, missionIndex)
  const rewardAmount = guestMissionDisplayReward(mission)
  const coverImageUrl =
    resolveMissionCoverImageUrl(mission) ?? legacyCardArtworkFallback(mission)
  const ctaLabel = (mission.card_cta_label ?? '').trim() || 'Start mission'
  const completedLabel = (mission.card_completed_label ?? '').trim() || 'Completed'

  return (
    <button
      type="button"
      data-mission-card
      disabled={limitReached}
      onClick={onOpen}
      className={`relative flex h-[min(420px,62vh)] w-[min(300px,78vw)] shrink-0 snap-start flex-col overflow-hidden rounded-3xl p-5 text-left transition active:scale-[0.99] ${limitReached ? 'opacity-95' : ''}`}
      style={coverImageUrl ? undefined : { background: surface }}
    >
      {coverImageUrl ? (
        <span
          key={coverImageUrl}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${JSON.stringify(coverImageUrl)})`,
          }}
        />
      ) : null}
      <span
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 leading-none text-zinc-800"
        aria-hidden
      >
        <MissionCategoryTypeIcon type={mission.validation_type} size={COIN_SIZE} className="h-6 w-6" />
      </span>

      <h3 className="relative z-10 pr-12 text-left text-lg font-bold leading-snug text-white">
        {mission.title}
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
}
