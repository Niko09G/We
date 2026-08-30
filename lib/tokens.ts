/**
 * Beatcoin token redemption helpers.
 * Redemptions are stored in public.token_redemptions (see token_redemptions_per_table.sql).
 */

import { isBeatcoinTokenUuid } from '@/lib/admin-tokens'
import { getMissionsEnabledWithClient } from '@/lib/app-settings'
import type { SupabaseClient } from '@supabase/supabase-js'

export const TOKEN_REDEMPTIONS_TABLE = 'token_redemptions' as const

export type BeatcoinTokenRow = {
  id: string
  token: string
  points: number
  mission_id: string
}

export type BeatcoinClaimResult =
  | { ok: true; points: number; mission_submission_id?: string | null }
  | { ok: false; error: string }

export type BeatcoinResetResult =
  | {
      ok: true
      deleted_submissions: number
      deleted_redemptions: number
      already_available: boolean
      message: string
    }
  | { ok: false; error: string }

type RedemptionRow = {
  id: string
  table_id: string
  mission_submission_id?: string | null
}

function isMissingMissionSubmissionIdColumn(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('mission_submission_id') &&
    (m.includes('schema cache') ||
      m.includes('could not find') ||
      m.includes('does not exist') ||
      m.includes('column'))
  )
}

/** Insert a redemption row; omits mission_submission_id when the column is absent. */
async function insertTokenRedemption(
  supabase: SupabaseClient,
  row: { token_id: string; table_id: string; mission_submission_id?: string | null }
): Promise<void> {
  const base = {
    token_id: String(row.token_id),
    table_id: String(row.table_id),
  }
  const submissionId =
    typeof row.mission_submission_id === 'string' && row.mission_submission_id.length > 0
      ? String(row.mission_submission_id)
      : null

  if (submissionId) {
    const { error } = await supabase.from(TOKEN_REDEMPTIONS_TABLE).insert({
      ...base,
      mission_submission_id: submissionId,
    })
    if (!error) return
    if (!isMissingMissionSubmissionIdColumn(error.message)) {
      throw Object.assign(new Error(error.message), { code: error.code })
    }
  }

  const { error: fallbackErr } = await supabase.from(TOKEN_REDEMPTIONS_TABLE).insert(base)
  if (fallbackErr) {
    throw Object.assign(new Error(fallbackErr.message), { code: fallbackErr.code })
  }
}

/** Load redemptions without requiring mission_submission_id in the schema cache. */
async function fetchRedemptionsForToken(
  supabase: SupabaseClient,
  tokenId: string
): Promise<RedemptionRow[]> {
  const withLink = await supabase
    .from(TOKEN_REDEMPTIONS_TABLE)
    .select('id, table_id, mission_submission_id')
    .eq('token_id', String(tokenId))

  if (!withLink.error) return (withLink.data ?? []) as RedemptionRow[]

  if (!isMissingMissionSubmissionIdColumn(withLink.error.message)) {
    throw new Error(withLink.error.message)
  }

  const withoutLink = await supabase
    .from(TOKEN_REDEMPTIONS_TABLE)
    .select('id, table_id')
    .eq('token_id', String(tokenId))

  if (withoutLink.error) throw new Error(withoutLink.error.message)
  return (withoutLink.data ?? []) as RedemptionRow[]
}

/**
 * Award leaderboard points for a Beatcoin claim via an approved mission_submission.
 * The guest leaderboard reads points from approved beatcoin submissions (points_awarded).
 */
async function awardBeatcoinLeaderboardPoints(
  supabase: SupabaseClient,
  tableId: string,
  missionId: string,
  tokenId: string,
  points: number
): Promise<string | null> {
  const { data: submission, error: subErr } = await supabase
    .from('mission_submissions')
    .insert({
      table_id: String(tableId),
      mission_id: String(missionId),
      status: 'approved',
      submission_type: 'beatcoin',
      submission_data: {
        beatcoin_token_id: String(tokenId),
        points_awarded: points,
      },
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (subErr) {
    if (subErr.code === '23505') {
      throw Object.assign(new Error('already_claimed_by_table'), { code: '23505' })
    }
    throw new Error(subErr.message)
  }

  return submission?.id ? String(submission.id) : null
}

/** Remove beatcoin leaderboard points for a token (all claiming tables). */
async function revokeBeatcoinLeaderboardPoints(
  supabase: SupabaseClient,
  tokenId: string,
  missionId: string,
  linkedSubmissionIds: string[]
): Promise<number> {
  const submissionIdSet = new Set(linkedSubmissionIds.map((id) => String(id)))

  const { data: linkedSubs, error: linkedSubsErr } = await supabase
    .from('mission_submissions')
    .select('id')
    .eq('submission_type', 'beatcoin')
    .eq('mission_id', String(missionId))
    .contains('submission_data', { beatcoin_token_id: String(tokenId) })

  if (linkedSubsErr) throw new Error(linkedSubsErr.message)
  for (const row of linkedSubs ?? []) {
    submissionIdSet.add(String(row.id))
  }

  const allSubmissionIds = [...submissionIdSet]
  if (allSubmissionIds.length === 0) return 0

  const { error: deleteSubsErr, count } = await supabase
    .from('mission_submissions')
    .delete({ count: 'exact' })
    .in('id', allSubmissionIds)

  if (deleteSubsErr) throw new Error(deleteSubsErr.message)
  return count ?? allSubmissionIds.length
}

/**
 * Resolve QR / URL input to a beatcoin_tokens row (direct table query).
 * Matches case-insensitively on token text; falls back to row id when input is a UUID.
 * Never compares the text `token` column to a uuid-typed parameter.
 */
export async function lookupBeatcoinTokenRow(
  supabase: SupabaseClient,
  rawToken: string
): Promise<BeatcoinTokenRow | null> {
  const normalized = String(rawToken).trim()
  if (!normalized) return null

  const { data: byIlike, error: ilikeErr } = await supabase
    .from('beatcoin_tokens')
    .select('id, token, points, mission_id')
    .ilike('token', normalized)
    .limit(1)
    .maybeSingle()

  if (ilikeErr) throw new Error(ilikeErr.message)
  if (byIlike) return byIlike as BeatcoinTokenRow

  if (isBeatcoinTokenUuid(normalized)) {
    const { data: byId, error: idErr } = await supabase
      .from('beatcoin_tokens')
      .select('id, token, points, mission_id')
      .eq('id', String(normalized))
      .maybeSingle()

    if (idErr) throw new Error(idErr.message)
    if (byId) return byId as BeatcoinTokenRow
  }

  return null
}

/** True when this table already redeemed the token. */
export async function hasBeatcoinRedemptionForTable(
  supabase: SupabaseClient,
  tokenId: string,
  tableId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TOKEN_REDEMPTIONS_TABLE)
    .select('id')
    .eq('token_id', String(tokenId))
    .eq('table_id', String(tableId))
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data != null
}

/**
 * Claim a Beatcoin for a table: approved mission_submission + token_redemptions row.
 * Leaderboard points come from the approved submission (points_awarded in submission_data).
 */
export async function claimBeatcoinForTable(
  supabase: SupabaseClient,
  rawToken: string,
  tableId: string
): Promise<BeatcoinClaimResult> {
  const normalizedTableId = String(tableId).trim()
  if (!normalizedTableId) return { ok: false, error: 'missing_token_or_table' }

  const missionsEnabled = await getMissionsEnabledWithClient(supabase)
  if (!missionsEnabled) return { ok: false, error: 'missions_disabled' }

  const tokenRow = await lookupBeatcoinTokenRow(supabase, rawToken)
  if (!tokenRow) return { ok: false, error: 'invalid_token' }

  const tokenId = String(tokenRow.id)
  const missionId = String(tokenRow.mission_id)

  if (await hasBeatcoinRedemptionForTable(supabase, tokenId, normalizedTableId)) {
    return { ok: false, error: 'already_claimed_by_table' }
  }

  const { data: mission, error: missionErr } = await supabase
    .from('missions')
    .select('id, validation_type')
    .eq('id', missionId)
    .maybeSingle()

  if (missionErr) throw new Error(missionErr.message)
  if (!mission) return { ok: false, error: 'mission_not_found' }
  if (String(mission.validation_type) !== 'beatcoin') {
    return { ok: false, error: 'invalid_mission' }
  }

  const { data: table, error: tableErr } = await supabase
    .from('tables')
    .select('id, is_archived, is_active')
    .eq('id', normalizedTableId)
    .maybeSingle()

  if (tableErr) throw new Error(tableErr.message)
  if (!table) return { ok: false, error: 'table_not_found' }
  if (table.is_archived === true) return { ok: false, error: 'table_archived' }
  if (table.is_active === false) return { ok: false, error: 'table_inactive' }

  const { data: assignment, error: assignErr } = await supabase
    .from('mission_assignments')
    .select('id')
    .eq('table_id', normalizedTableId)
    .eq('mission_id', missionId)
    .eq('is_active', true)
    .maybeSingle()

  if (assignErr) throw new Error(assignErr.message)
  if (!assignment) return { ok: false, error: 'mission_not_assigned' }

  const points = Math.max(0, Math.floor(Number(tokenRow.points) || 0))

  let submissionId: string | null = null
  try {
    submissionId = await awardBeatcoinLeaderboardPoints(
      supabase,
      normalizedTableId,
      missionId,
      tokenId,
      points
    )
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? String((e as { code?: string }).code) : ''
    if (code === '23505' || (e instanceof Error && e.message === 'already_claimed_by_table')) {
      return { ok: false, error: 'already_claimed_by_table' }
    }
    throw e
  }

  try {
    await insertTokenRedemption(supabase, {
      token_id: tokenId,
      table_id: normalizedTableId,
      mission_submission_id: submissionId,
    })
  } catch (redemptionErr) {
    if (submissionId) {
      await supabase.from('mission_submissions').delete().eq('id', submissionId)
    }
    const code =
      redemptionErr instanceof Error && 'code' in redemptionErr
        ? String((redemptionErr as { code?: string }).code)
        : ''
    if (code === '23505') {
      return { ok: false, error: 'already_claimed_by_table' }
    }
    throw redemptionErr
  }

  return {
    ok: true,
    points,
    mission_submission_id: submissionId,
  }
}

/**
 * Admin reset: remove all redemptions for a token, delete linked mission_submissions
 * (leaderboard deduction), and clear legacy claim columns on beatcoin_tokens.
 */
export async function resetBeatcoinTokenById(
  supabase: SupabaseClient,
  tokenId: string
): Promise<BeatcoinResetResult> {
  const normalizedTokenId = String(tokenId).trim()
  if (!normalizedTokenId) return { ok: false, error: 'token_not_found' }

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('beatcoin_tokens')
    .select('id, mission_id, points, claimed_at')
    .eq('id', normalizedTokenId)
    .maybeSingle()

  if (tokenErr) throw new Error(tokenErr.message)
  if (!tokenRow) return { ok: false, error: 'token_not_found' }

  const missionId = String(tokenRow.mission_id)

  const redemptionRows = await fetchRedemptionsForToken(supabase, normalizedTokenId)
  const linkedSubmissionIds = redemptionRows
    .map((r) => r.mission_submission_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => String(id))

  const deletedSubmissions = await revokeBeatcoinLeaderboardPoints(
    supabase,
    normalizedTokenId,
    missionId,
    linkedSubmissionIds
  )

  const { error: deleteRedemptionsErr, count: deletedRedemptions } = await supabase
    .from(TOKEN_REDEMPTIONS_TABLE)
    .delete({ count: 'exact' })
    .eq('token_id', normalizedTokenId)

  if (deleteRedemptionsErr) throw new Error(deleteRedemptionsErr.message)

  await supabase
    .from('beatcoin_tokens')
    .update({ claimed_by_table_id: null, claimed_at: null })
    .eq('id', normalizedTokenId)

  const redemptionCount = redemptionRows.length
  const alreadyAvailable = redemptionCount === 0 && tokenRow.claimed_at == null

  return {
    ok: true,
    deleted_submissions: deletedSubmissions,
    deleted_redemptions: deletedRedemptions ?? redemptionCount,
    already_available: alreadyAvailable,
    message: alreadyAvailable
      ? 'Token was already available.'
      : `Token reset (${deletedRedemptions ?? redemptionCount} claim(s) cleared).`,
  }
}
