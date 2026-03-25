'use client'

import { use } from 'react'
import { MissionBuilder } from '@/app/admin/missions/_components/MissionBuilder'

export default function EditMissionPage({
  params,
}: {
  params: Promise<{ missionId: string }>
}) {
  const { missionId } = use(params)
  return <MissionBuilder missionId={missionId} />
}
