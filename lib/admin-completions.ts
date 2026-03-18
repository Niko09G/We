import { supabase } from '@/lib/supabase/client'
import type { MissionsTableRow } from '@/lib/missions-schema'

export type AdminTable = { id: string; name: string }
/** Subset of missions schema for completion dropdown. */
export type AdminMission = Pick<MissionsTableRow, 'id' | 'title' | 'points'>
export type AdminCompletion = {
  id: string
  table_id: string
  mission_id: string
  created_at: string
}

export async function fetchAdminMissionData(): Promise<{
  tables: AdminTable[]
  missions: AdminMission[]
  completions: AdminCompletion[]
}> {
  const [tablesRes, completionsRes, missionsRes] = await Promise.all([
    supabase.from('tables').select('id,name').order('name'),
    supabase
      .from('completions')
      .select('id,table_id,mission_id,created_at')
      .order('created_at', { ascending: false }),
    supabase.from('missions').select('id,title,points').order('title'),
  ])

  if (tablesRes.error) throw new Error(tablesRes.error.message || 'Failed to load tables.')
  if (completionsRes.error) throw new Error(completionsRes.error.message || 'Failed to load completions.')
  if (missionsRes.error) throw new Error(missionsRes.error.message || 'Failed to load missions.')

  return {
    tables: (tablesRes.data ?? []) as AdminTable[],
    missions: (missionsRes.data ?? []) as AdminMission[],
    completions: (completionsRes.data ?? []) as AdminCompletion[],
  }
}

export async function insertCompletion(tableId: string, missionId: string): Promise<void> {
  const { error } = await supabase.from('completions').insert({
    table_id: tableId,
    mission_id: missionId,
  })
  if (error) {
    if (error.code === '23505') {
      throw new Error('This mission is already completed for that table.')
    }
    throw new Error(error.message || 'Failed to record completion.')
  }
}
