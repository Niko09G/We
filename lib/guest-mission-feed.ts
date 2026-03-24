import { supabase } from '@/lib/supabase/client'

const FEED_LIMIT = 14

function safeTime(iso: string | null | undefined): number {
  if (!iso) return 0
  const n = Date.parse(iso)
  return Number.isFinite(n) ? n : 0
}

/** Match mission titles (case-insensitive). */
export function adviceMissionTitleMatch(title: string): boolean {
  return /share your worst marriage advice/i.test(title.trim())
}

export function greetingMissionTitleMatch(title: string): boolean {
  return /post a table greeting/i.test(title.trim())
}

/** When exact title missing — same heuristics as mission cards on /missions/[tableId]. */
export function resolveAdviceMissionIdFromRows(
  rows: Array<{ id: string; title: string | null | undefined }>
): string | null {
  const exact = rows.find((m) => adviceMissionTitleMatch(m.title ?? ''))
  if (exact) return exact.id
  const broad = rows.find((m) => {
    const t = (m.title ?? '').trim()
    if (!t) return false
    return /worst.*marriage.*advice|marriage advice|share.*advice/i.test(t)
  })
  return broad?.id ?? null
}

/**
 * Pick greeting mission id from assigned missions list (exact title, then greet|greeting).
 */
export function resolveGreetingMissionIdFromRows(
  rows: Array<{ id: string; title: string | null | undefined }>
): string | null {
  const exact = rows.find((m) => greetingMissionTitleMatch(m.title ?? ''))
  if (exact) return exact.id
  const broad = rows.find((m) => {
    const t = (m.title ?? '').trim()
    if (!t) return false
    return /greet|greeting/i.test(t)
  })
  return broad?.id ?? null
}

export type GuestMissionFeedItem =
  | {
      kind: 'advice'
      id: string
      missionId: string
      createdAt: string
      advice: string
      tableName: string
      tableColor: string | null
    }
  | {
      kind: 'greeting'
      id: string
      missionId: string
      createdAt: string
      mediaUrl: string
      mediaType: 'image' | 'video'
      caption: string
      senderLabel: string
      tableColor: string | null
    }

type MissionIdRow = { id: string; title: string }

type SubmissionRow = {
  id: string
  mission_id: string
  status: string
  submission_type: string
  submission_data: unknown
  created_at: string
  table_id: string
}

type GreetingFeedRow = {
  id: string
  message: string
  image_url: string
  created_at: string
  table_name: string | null
  table_color: string | null
  mission_submission_id: string | null
}

/** Prefer video URL shape for `<video>` when the URL clearly points at video. */
function inferMediaTypeFromUrl(url: string): 'image' | 'video' {
  const base = url.split('?')[0].toLowerCase()
  if (/\.(mp4|webm|mov|m4v|ogv)(\s|$)/.test(base)) return 'video'
  return 'image'
}

/** Supabase JSONB is usually an object; handle legacy string JSON. */
export function normalizeSubmissionData(raw: unknown): Record<string, unknown> {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (typeof p === 'object' && p !== null && !Array.isArray(p))
        return p as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

async function loadTableMeta(tableIds: string[]) {
  const tableMeta = new Map<string, { name: string; color: string | null }>()
  if (tableIds.length === 0) return tableMeta

  const { data: trows, error: terr } = await supabase
    .from('tables')
    .select('id,name,color')
    .in('id', tableIds)
  if (!terr && trows) {
    for (const t of trows as Array<{ id: string; name?: string | null; color?: string | null }>) {
      tableMeta.set(t.id, {
        name: (t.name ?? '').trim() || 'Table',
        color: t.color?.trim() ?? null,
      })
    }
  }
  return tableMeta
}

function parseAdviceRows(
  rows: SubmissionRow[],
  tableMeta: Map<string, { name: string; color: string | null }>
): Extract<GuestMissionFeedItem, { kind: 'advice' }>[] {
  const out: Extract<GuestMissionFeedItem, { kind: 'advice' }>[] = []
  for (const row of rows) {
    const d = normalizeSubmissionData(row.submission_data)
    const text = typeof d.text === 'string' ? d.text.trim() : ''
    if (!text) continue
    const meta = tableMeta.get(row.table_id)
    out.push({
      kind: 'advice',
      id: row.id,
      missionId: row.mission_id,
      createdAt: row.created_at,
      advice: text,
      tableName: meta?.name ?? 'Table',
      tableColor: meta?.color ?? null,
    })
  }
  return out
}

const IN_CHUNK = 100

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

/**
 * Greeting cards: canonical data from `greetings` (ready + mission).
 * Linked `mission_submissions` may be any status; we only use them to scope rows to greetingMissionId.
 */
async function fetchGreetingFeedItemsFromGreetingsTable(
  greetingMissionId: string
): Promise<Extract<GuestMissionFeedItem, { kind: 'greeting' }>[]> {
  const { data: subs, error: subErr } = await supabase
    .from('mission_submissions')
    .select('id')
    .eq('mission_id', greetingMissionId)

  if (subErr || !subs?.length) return []

  const submissionIds = subs.map((s) => s.id as string)
  const greetingById = new Map<string, GreetingFeedRow>()

  for (const part of chunkIds(submissionIds, IN_CHUNK)) {
    const { data: rows, error: gErr } = await supabase
      .from('greetings')
      .select(
        'id, message, image_url, created_at, table_name, table_color, mission_submission_id'
      )
      .eq('source_type', 'mission')
      .eq('status', 'ready')
      .in('mission_submission_id', part)

    if (gErr || !rows?.length) continue

    for (const raw of rows as GreetingFeedRow[]) {
      greetingById.set(raw.id, raw)
    }
  }

  const list = [...greetingById.values()].sort(
    (a, b) => safeTime(b.created_at) - safeTime(a.created_at)
  )

  const out: Extract<GuestMissionFeedItem, { kind: 'greeting' }>[] = []
  for (const g of list) {
    const url =
      typeof g.image_url === 'string' ? g.image_url.trim() : ''
    if (!url) continue

    const caption =
      typeof g.message === 'string' ? g.message.trim() : ''
    const sender =
      typeof g.table_name === 'string' && g.table_name.trim().length > 0
        ? g.table_name.trim()
        : 'Table'
    const tableColor =
      typeof g.table_color === 'string' ? g.table_color.trim() : null

    out.push({
      kind: 'greeting',
      id: g.id,
      missionId: greetingMissionId,
      createdAt: g.created_at,
      mediaUrl: url,
      mediaType: inferMediaTypeFromUrl(url),
      caption,
      senderLabel: sender,
      tableColor: tableColor && tableColor.length > 0 ? tableColor : null,
    })
  }

  return out
}

/**
 * Resolve IDs for the two feed missions (global active missions — fallback when assignments empty).
 */
export async function resolveFeedMissionIds(): Promise<{
  adviceMissionId: string | null
  greetingMissionId: string | null
}> {
  const { data, error } = await supabase
    .from('missions')
    .select('id,title')
    .eq('is_active', true)

  if (error || !data?.length) {
    return { adviceMissionId: null, greetingMissionId: null }
  }

  const rows = data as MissionIdRow[]
  return {
    adviceMissionId: resolveAdviceMissionIdFromRows(rows),
    greetingMissionId: resolveGreetingMissionIdFromRows(rows),
  }
}

/**
 * Combined feed: advice from mission_submissions (approved/pending);
 * greetings from `greetings` (ready, mission) scoped to greeting mission via linked submission ids.
 * Newest first, max 14 total.
 */
export async function fetchGuestMissionFeed(
  adviceMissionId: string | null,
  greetingMissionId: string | null
): Promise<GuestMissionFeedItem[]> {
  const advice: GuestMissionFeedItem[] = []
  const greeting: GuestMissionFeedItem[] = []

  if (adviceMissionId) {
    const { data, error } = await supabase
      .from('mission_submissions')
      .select(
        'id, mission_id, status, submission_type, submission_data, created_at, table_id'
      )
      .eq('mission_id', adviceMissionId)
      .in('status', ['approved', 'pending'])
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT)

    if (!error && data?.length) {
      const rows = data as SubmissionRow[]
      const tableMeta = await loadTableMeta([
        ...new Set(rows.map((r) => r.table_id)),
      ])
      advice.push(...parseAdviceRows(rows, tableMeta))
    }
  }

  if (greetingMissionId) {
    greeting.push(
      ...(await fetchGreetingFeedItemsFromGreetingsTable(greetingMissionId))
    )
  }

  const merged = [...advice, ...greeting].sort(
    (a, b) => safeTime(b.createdAt) - safeTime(a.createdAt)
  )
  return merged.slice(0, FEED_LIMIT)
}
