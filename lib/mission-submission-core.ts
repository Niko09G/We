import type { SupabaseClient } from '@supabase/supabase-js'
import { getMissionsEnabledWithClient } from '@/lib/app-settings'
import {
  effectiveMaxSubmissionsPerTable,
  isRepeatableAutoMission,
} from '@/lib/mission-limits'

/** Mirrors mission_submissions.submission_type and missions.validation_type. */
export type SubmissionType = 'signature' | 'photo' | 'video' | 'text' | 'beatcoin'

export type MissionSubmissionInput = {
  table_id: string
  mission_id: string
  submission_type: SubmissionType
  submission_data?: Record<string, unknown> | null
  /** Optional idempotency key from client to safely retry after network errors. */
  client_request_id?: string | null
}

export type MissionSubmissionResult = {
  autoApproved: boolean
  repeatable: boolean
  approvedCount?: number
  missionSubmissionId?: string
}

/**
 * Canonical mission submission write path: validate + insert.
 * Used by POST /api/missions/submit (server). Same Supabase anon + RLS as the browser.
 */
export async function executeMissionSubmission(
  supabase: SupabaseClient,
  input: MissionSubmissionInput
): Promise<MissionSubmissionResult> {
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_mission_attempt', {
    p_table_id: input.table_id,
    p_mission_id: input.mission_id,
    p_submission_type: input.submission_type,
    p_submission_data: input.submission_data ?? null,
    p_client_request_id: input.client_request_id?.trim() || null,
  })
  if (!rpcErr) {
    const row = rpcRes as
      | {
          ok?: boolean
          error?: string
          auto_approved?: boolean
          repeatable?: boolean
          approved_count?: number | null
          mission_submission_id?: string
        }
      | null
    if (row?.ok === true) {
      return {
        autoApproved: Boolean(row.auto_approved),
        repeatable: Boolean(row.repeatable),
        approvedCount:
          typeof row.approved_count === 'number' ? row.approved_count : undefined,
        missionSubmissionId: row.mission_submission_id,
      }
    }
    const code = String(row?.error ?? 'submission_failed')
    if (code === 'missions_disabled')
      throw new Error('Missions are currently opening soon. Please try again later.')
    if (code === 'mission_not_available')
      throw new Error('This mission is not available for your table.')
    if (code === 'table_not_found') throw new Error('Table not found.')
    if (code === 'table_archived') throw new Error('This table is archived.')
    if (code === 'table_inactive') throw new Error('This table is not active.')
    if (code === 'mission_not_found') throw new Error('Mission not found.')
    if (code === 'beatcoin_requires_qr_claim')
      throw new Error('Beatcoin missions are redeemed by scanning a QR code, not this form.')
    if (code === 'text_required') throw new Error('Message cannot be empty.')
    if (code === 'message_required') throw new Error('Message is required for this mission.')
    if (code === 'already_completed')
      throw new Error('This mission is already completed for your table.')
    if (code === 'submission_limit_reached') throw new Error('Submission limit reached')
    throw new Error('Submission failed')
  }
  // If RPC is not deployed yet, fallback to legacy path below.
  if (rpcErr.code !== 'PGRST202') {
    throw new Error(rpcErr.message || 'Submission failed')
  }

  const enabled = await getMissionsEnabledWithClient(supabase)
  if (enabled !== true) {
    throw new Error('Missions are currently opening soon. Please try again later.')
  }

  const { data: assignment, error: aErr } = await supabase
    .from('mission_assignments')
    .select('id')
    .eq('table_id', input.table_id)
    .eq('mission_id', input.mission_id)
    .eq('is_active', true)
    .maybeSingle()

  if (aErr) throw new Error(aErr.message || 'Failed to validate mission availability.')
  if (!assignment) {
    throw new Error('This mission is not available for your table.')
  }

  const { data: teamRow, error: teamErr } = await supabase
    .from('tables')
    .select('id,is_archived,is_active')
    .eq('id', input.table_id)
    .maybeSingle()
  if (teamErr) throw new Error(teamErr.message || 'Failed to verify table.')
  if (!teamRow) throw new Error('Table not found.')
  if ((teamRow as { is_archived?: boolean }).is_archived === true) {
    throw new Error('This table is archived.')
  }
  if ((teamRow as { is_active?: boolean }).is_active === false) {
    throw new Error('This table is not active.')
  }

  const { data: mission, error: mErr } = await supabase
    .from('missions')
    .select(
      'id,title,approval_mode,allow_multiple_submissions,max_submissions_per_table,add_to_greetings,points_per_submission,message_required,validation_type'
    )
    .eq('id', input.mission_id)
    .maybeSingle()

  if (mErr) throw new Error(mErr.message || 'Failed to load mission settings.')
  if (!mission) throw new Error('Mission not found.')

  const mRow = mission as Record<string, unknown>
  if (String(mRow.validation_type ?? '') === 'beatcoin') {
    throw new Error('Beatcoin missions are redeemed by scanning a QR code, not this form.')
  }
  const effectiveMax = effectiveMaxSubmissionsPerTable({
    max_submissions_per_table: mRow.max_submissions_per_table as number | null | undefined,
    allow_multiple_submissions: mRow.allow_multiple_submissions === true,
  })
  const approvalMode = String(mRow.approval_mode ?? 'manual')
  const isAutoApprove = approvalMode === 'auto'
  const isRepeatableAuto = isRepeatableAutoMission({
    approval_mode: approvalMode,
    max_submissions_per_table: mRow.max_submissions_per_table as number | null | undefined,
    allow_multiple_submissions: mRow.allow_multiple_submissions === true,
  })
  const messageRequired = mRow.message_required === true
  const message = (input.submission_data?.message as string | undefined)?.trim()
  const textBody = (input.submission_data?.text as string | undefined)?.trim()

  if (input.submission_type === 'text') {
    if (!textBody) {
      throw new Error('Message cannot be empty.')
    }
  } else if (messageRequired && !message) {
    throw new Error('Message is required for this mission.')
  }

  if (effectiveMax === 1) {
    const compRes = await supabase
      .from('completions')
      .select('id')
      .eq('table_id', input.table_id)
      .eq('mission_id', input.mission_id)
      .limit(1)
    if (compRes.error) throw new Error(compRes.error.message || 'Failed to validate mission completion.')
    if ((compRes.data ?? []).length > 0) {
      throw new Error('This mission is already completed for your table.')
    }
  }

  const { count: usedCount, error: cntErr } = await supabase
    .from('mission_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('table_id', input.table_id)
    .eq('mission_id', input.mission_id)
    .in('status', ['pending', 'approved'])

  if (cntErr) throw new Error(cntErr.message || 'Failed to validate submission count.')
  const used = typeof usedCount === 'number' ? usedCount : 0
  if (effectiveMax !== null && used >= effectiveMax) {
    throw new Error('Submission limit reached')
  }

  const nowIso = new Date().toISOString()
  const insertStatus = isAutoApprove ? 'approved' : 'pending'
  const { data: inserted, error } = await supabase
    .from('mission_submissions')
    .insert({
      table_id: input.table_id,
      mission_id: input.mission_id,
      status: insertStatus,
      submission_type: input.submission_type,
      submission_data: input.submission_data ?? null,
      approved_at: isAutoApprove ? nowIso : null,
      client_request_id: input.client_request_id?.trim() || null,
    })
    .select('id')
    .maybeSingle()
  if (error) {
    if (error.code === '23505')
      throw new Error('You already have a pending or approved submission for this table and mission.')
    throw new Error(error.message || 'Failed to save submission.')
  }

  if (isAutoApprove && effectiveMax === 1) {
    const { error: compErr } = await supabase.from('completions').insert({
      table_id: input.table_id,
      mission_id: input.mission_id,
    })
    if (compErr && compErr.code !== '23505') {
      throw new Error(compErr.message || 'Failed to record completion.')
    }
  }

  if (
    isAutoApprove &&
    input.submission_type === 'photo' &&
    (mission as Record<string, unknown>).add_to_greetings === true
  ) {
    const imageUrl = input.submission_data?.image_url
    if (typeof imageUrl === 'string' && imageUrl.length > 0) {
      const missionTitle = String((mission as Record<string, unknown>).title ?? 'Greeting')
      const greetingMessage = message && message.length > 0 ? message : missionTitle
      const missionSubmissionId = inserted?.id as string | undefined
      const { data: table } = await supabase
        .from('tables')
        .select('id,name,color')
        .eq('id', input.table_id)
        .maybeSingle()
      await supabase.from('greetings').insert({
        name: (table?.name as string | undefined) ?? null,
        message: greetingMessage,
        image_url: imageUrl,
        status: 'ready',
        source_type: 'mission',
        table_id: input.table_id,
        table_name: (table?.name as string | undefined) ?? null,
        table_color: ((table as { color?: string | null } | null)?.color as string | null) ?? null,
        mission_submission_id: missionSubmissionId ?? null,
      })
    }
  }

  if (isAutoApprove) {
    if (isRepeatableAuto) {
      const { count, error: cErr } = await supabase
        .from('mission_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('table_id', input.table_id)
        .eq('mission_id', input.mission_id)
        .eq('status', 'approved')
      if (cErr) throw new Error(cErr.message || 'Failed to read submission count.')
      return {
        autoApproved: true,
        repeatable: true,
        approvedCount: typeof count === 'number' ? count : undefined,
        missionSubmissionId: inserted?.id as string | undefined,
      }
    }
    return {
      autoApproved: true,
      repeatable: false,
      missionSubmissionId: inserted?.id as string | undefined,
    }
  }

  return {
    autoApproved: false,
    repeatable: effectiveMax === null || effectiveMax > 1,
    missionSubmissionId: inserted?.id as string | undefined,
  }
}
