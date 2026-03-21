import { supabase } from '@/lib/supabase/client'

export async function listActiveMissionAssignmentsForAdmin(): Promise<
  Record<string, string[]>
> {
  // Returns mapping: mission_id -> table_id[]
  const { data, error } = await supabase
    .from('mission_assignments')
    .select('mission_id,table_id')
    .eq('is_active', true)

  if (error) throw new Error(error.message || 'Failed to load mission assignments.')

  const out: Record<string, string[]> = {}
  ;(data ?? []).forEach((row) => {
    const mid = row.mission_id as string
    const tid = row.table_id as string
    if (!out[mid]) out[mid] = []
    out[mid].push(tid)
  })

  return out
}

export async function setMissionAssignmentsForMission(input: {
  missionId: string
  desiredTableIds: string[]
  activeTableIds: string[]
}): Promise<void> {
  const missionId = input.missionId
  const desiredSet = new Set(input.desiredTableIds)
  const activeSet = new Set(input.activeTableIds)

  // Only allow assignments within the "active tables" universe for the admin MVP.
  const desired = input.desiredTableIds.filter((tid) => activeSet.has(tid))
  const toDeactivate = input.activeTableIds.filter((tid) => !desiredSet.has(tid))

  // Upsert desired active assignments.
  if (desired.length > 0) {
    const { error: upErr } = await supabase
      .from('mission_assignments')
      .upsert(
        desired.map((table_id) => ({
          mission_id: missionId,
          table_id,
          is_active: true,
        })),
        { onConflict: 'mission_id,table_id' }
      )
    if (upErr) throw new Error(upErr.message || 'Failed to assign missions.')
  }

  // Deactivate assignments that were previously active but are no longer desired.
  if (toDeactivate.length > 0) {
    const { error: deErr } = await supabase
      .from('mission_assignments')
      .update({ is_active: false })
      .eq('mission_id', missionId)
      .in('table_id', toDeactivate)

    if (deErr) throw new Error(deErr.message || 'Failed to update mission assignments.')
  }
}

