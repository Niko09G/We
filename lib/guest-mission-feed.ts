import { resolveTeamPageConfig } from '@/lib/team-page-config'
import { supabase } from '@/lib/supabase/client'

const FEED_LIMIT = 14
export const LIVE_FEED_PAGE_SIZE = 15

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
      tableId: string
      createdAt: string
      advice: string
      tableName: string
      tableColor: string | null
    }
  | {
      kind: 'greeting'
      id: string
      missionId: string
      tableId: string | null
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
  table_id?: string | null
  table_name: string | null
  table_color: string | null
  mission_submission_id?: string | null
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

type TableMeta = { name: string; color: string | null }

async function loadTableMeta(tableIds: string[]): Promise<Map<string, TableMeta>> {
  const tableMeta = new Map<string, TableMeta>()
  const unique = [...new Set(tableIds.map((id) => id?.trim()).filter(Boolean) as string[])]
  if (unique.length === 0) return tableMeta

  const { data: trows, error: terr } = await supabase
    .from('tables')
    .select('id,name,color,team_id,teams(id,name)')
    .in('id', unique)
  if (!terr && trows) {
    for (const raw of trows) {
      const t = raw as {
        id: string
        name?: string | null
        color?: string | null
        teams?: { id: string; name: string } | { id: string; name: string }[] | null
      }
      const embedded = t.teams
      const teamRow = Array.isArray(embedded) ? embedded[0] : embedded
      const teamName = typeof teamRow?.name === 'string' ? teamRow.name.trim() : ''
      const tableName = (t.name ?? '').trim()
      tableMeta.set(t.id, {
        name: teamName || tableName || 'Table',
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
      tableId: row.table_id,
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
        'id, message, image_url, created_at, table_id, table_name, table_color, mission_submission_id'
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

  const tableIds = list
    .map((g) => (typeof g.table_id === 'string' ? g.table_id : null))
    .filter((id): id is string => Boolean(id))
  const tableMeta = await loadTableMeta(tableIds)

  const out: Extract<GuestMissionFeedItem, { kind: 'greeting' }>[] = []
  for (const g of list) {
    const url =
      typeof g.image_url === 'string' ? g.image_url.trim() : ''
    if (!url) continue

    const caption =
      typeof g.message === 'string' ? g.message.trim() : ''
    const tableId = typeof g.table_id === 'string' ? g.table_id : null
    const meta = tableId ? tableMeta.get(tableId) : undefined
    const sender =
      meta?.name ??
      (typeof g.table_name === 'string' && g.table_name.trim().length > 0
        ? g.table_name.trim()
        : 'Table')
    const tableColor =
      meta?.color ??
      (typeof g.table_color === 'string' ? g.table_color.trim() : null)

    out.push({
      kind: 'greeting',
      id: g.id,
      missionId: greetingMissionId,
      tableId,
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

/** Unified live feed row for `/greetings` — greetings table + advice mission submissions. */
export type GuestLiveFeedItem = {
  id: string
  feedKind: 'greeting' | 'advice'
  created_at: string
  message: string
  image_url: string | null
  name: string | null
  table_id: string | null
  table_name: string | null
  table_color: string | null
  source_type?: 'upload' | 'mission'
  avatar_url: string | null
}

export type LiveFeedCursor = {
  created_at: string
  id: string
}

function compareLiveFeedDesc(a: GuestLiveFeedItem, b: GuestLiveFeedItem): number {
  const ta = safeTime(a.created_at)
  const tb = safeTime(b.created_at)
  if (tb !== ta) return tb - ta
  return b.id.localeCompare(a.id)
}

/** Items that sort after `cursor` in a newest-first feed (older / not yet shown). */
function liveFeedItemAfterCursor(
  item: GuestLiveFeedItem,
  cursor: LiveFeedCursor | null
): boolean {
  if (!cursor) return true
  const ta = safeTime(item.created_at)
  const tc = safeTime(cursor.created_at)
  if (ta < tc) return true
  if (ta > tc) return false
  return item.id < cursor.id
}

/** Table avatar URLs from `tables.page_config` (hero.avatarImage). */
export async function loadTableAvatarUrls(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('tables')
    .select('id,name,color,page_config')
    .eq('is_archived', false)

  if (error || !data?.length) return {}

  const map: Record<string, string> = {}
  for (const row of data) {
    const resolved = resolveTeamPageConfig(row.page_config, {
      tableColor: (row as { color?: string | null }).color ?? null,
      tableName: (row as { name?: string }).name ?? '',
    })
    const url = resolved.hero.avatarImage.url?.trim()
    if (url) map[row.id as string] = url
  }
  return map
}

function resolveFeedAvatarUrl(
  tableId: string | null | undefined,
  tableAvatars: Record<string, string>,
  guestEmblems: { team_emblem_by_table_id?: Record<string, string> } | null
): string | null {
  const tid = tableId?.trim()
  if (!tid) return null
  return (
    tableAvatars[tid]?.trim() ||
    guestEmblems?.team_emblem_by_table_id?.[tid]?.trim() ||
    null
  )
}

function greetingRowToLiveFeedItem(
  g: GreetingFeedRow & {
    name?: string | null
    source_type?: string | null
    status?: string
  },
  tableMeta: Map<string, TableMeta>,
  tableAvatars: Record<string, string>,
  guestEmblems: { team_emblem_by_table_id?: Record<string, string> } | null
): GuestLiveFeedItem | null {
  const message = typeof g.message === 'string' ? g.message.trim() : ''
  const imageUrl = typeof g.image_url === 'string' ? g.image_url.trim() : ''
  if (!message && !imageUrl) return null

  const tableId = typeof g.table_id === 'string' ? g.table_id : null
  const meta = tableId ? tableMeta.get(tableId) : undefined
  const tableName =
    meta?.name ??
    (typeof g.table_name === 'string' && g.table_name.trim()
      ? g.table_name.trim()
      : null)
  const tableColor =
    meta?.color ??
    (typeof g.table_color === 'string' && g.table_color.trim()
      ? g.table_color.trim()
      : null)

  return {
    id: `greeting-${g.id}`,
    feedKind: 'greeting',
    created_at: g.created_at,
    message: message || 'Greeting',
    image_url: imageUrl || null,
    name: typeof g.name === 'string' ? g.name.trim() || null : null,
    table_id: tableId,
    table_name: tableName,
    table_color: tableColor,
    source_type:
      g.source_type === 'mission' || g.source_type === 'upload'
        ? g.source_type
        : undefined,
    avatar_url: resolveFeedAvatarUrl(tableId, tableAvatars, guestEmblems),
  }
}

function adviceRowToLiveFeedItem(
  row: Extract<GuestMissionFeedItem, { kind: 'advice' }>,
  tableAvatars: Record<string, string>,
  guestEmblems: { team_emblem_by_table_id?: Record<string, string> } | null
): GuestLiveFeedItem {
  return {
    id: `advice-${row.id}`,
    feedKind: 'advice',
    created_at: row.createdAt,
    message: row.advice,
    image_url: null,
    name: row.tableName,
    table_id: row.tableId,
    table_name: row.tableName,
    table_color: row.tableColor,
    source_type: 'mission',
    avatar_url: resolveFeedAvatarUrl(row.tableId, tableAvatars, guestEmblems),
  }
}

type GreetingLiveRow = GreetingFeedRow & {
  name?: string | null
  source_type?: string | null
  mission_submission_id?: string | null
}

/**
 * Paginated unified live feed: ready greetings + marriage-advice mission submissions.
 * Cursor is the last item from the previous page (`created_at` + prefixed `id`).
 */
export async function fetchGuestLiveFeedPage(
  cursor: LiveFeedCursor | null,
  limit = LIVE_FEED_PAGE_SIZE,
  opts?: {
    tableAvatars?: Record<string, string>
    guestEmblems?: { team_emblem_by_table_id?: Record<string, string> }
  }
): Promise<{ items: GuestLiveFeedItem[]; nextCursor: LiveFeedCursor | null }> {
  const safeLimit = Math.min(30, Math.max(1, Math.floor(limit)))
  const overfetch = Math.max(safeLimit * 4, 60)

  const [{ adviceMissionId }, tableAvatars] = await Promise.all([
    resolveFeedMissionIds(),
    opts?.tableAvatars
      ? Promise.resolve(opts.tableAvatars)
      : loadTableAvatarUrls(),
  ])
  const guestEmblems = opts?.guestEmblems ?? null

  const greetingSelect =
    'id,name,message,image_url,status,created_at,source_type,table_id,table_name,table_color'

  let greetingQuery = supabase
    .from('greetings')
    .select(greetingSelect)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(overfetch)

  if (cursor) {
    greetingQuery = greetingQuery.lte('created_at', cursor.created_at)
  }

  const advicePromise = adviceMissionId
    ? (() => {
        let q = supabase
          .from('mission_submissions')
          .select(
            'id, mission_id, status, submission_type, submission_data, created_at, table_id'
          )
          .eq('mission_id', adviceMissionId)
          .in('status', ['approved', 'pending'])
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(overfetch)

        if (cursor) {
          q = q.lte('created_at', cursor.created_at)
        }
        return q
      })()
    : Promise.resolve({ data: null, error: null })

  const [greetingRes, adviceRes] = await Promise.all([greetingQuery, advicePromise])

  if (greetingRes.error) {
    throw new Error(greetingRes.error.message || 'Failed to load greetings.')
  }
  if (adviceRes.error) {
    throw new Error(adviceRes.error.message || 'Failed to load advice submissions.')
  }

  const greetingRows = (greetingRes.data ?? []) as GreetingLiveRow[]
  const greetingTableIds = greetingRows
    .map((g) => (typeof g.table_id === 'string' ? g.table_id : null))
    .filter((id): id is string => Boolean(id))
  const greetingTableMeta = await loadTableMeta(greetingTableIds)

  const greetingItems: GuestLiveFeedItem[] = []
  for (const raw of greetingRows) {
    const item = greetingRowToLiveFeedItem(
      raw,
      greetingTableMeta,
      tableAvatars,
      guestEmblems
    )
    if (item && liveFeedItemAfterCursor(item, cursor)) {
      greetingItems.push(item)
    }
  }

  const adviceItems: GuestLiveFeedItem[] = []
  const adviceRows = (adviceRes.data ?? []) as SubmissionRow[]
  if (adviceRows.length) {
    const tableMeta = await loadTableMeta([...new Set(adviceRows.map((r) => r.table_id))])
    const parsed = parseAdviceRows(adviceRows, tableMeta)
    for (const row of parsed) {
      const item = adviceRowToLiveFeedItem(row, tableAvatars, guestEmblems)
      if (liveFeedItemAfterCursor(item, cursor)) {
        adviceItems.push(item)
      }
    }
  }

  const merged = [...greetingItems, ...adviceItems]
    .sort(compareLiveFeedDesc)
    .slice(0, safeLimit)

  const nextCursor =
    merged.length === safeLimit
      ? {
          created_at: merged[merged.length - 1]!.created_at,
          id: merged[merged.length - 1]!.id,
        }
      : null

  return { items: merged, nextCursor }
}
