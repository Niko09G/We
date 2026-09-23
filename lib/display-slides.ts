import { supabase } from '@/lib/supabase/client'

export type DisplaySlideSpeaker = {
  name: string
  image_url: string
}

export type DisplaySlideRow = {
  id: string
  bg_color: string
  eyebrow: string
  title: string
  speakers: DisplaySlideSpeaker[]
  created_at: string
  updated_at: string
}

export type DisplaySlideInput = {
  bg_color: string
  eyebrow: string
  title: string
  speakers: DisplaySlideSpeaker[]
}

export const SLIDE_BG_PRESETS = [
  { id: 'navy', label: 'Navy', color: '#0f172a' },
  { id: 'charcoal', label: 'Dark Charcoal', color: '#18181b' },
  { id: 'violet', label: 'Deep Violet', color: '#2e1065' },
  { id: 'gold', label: 'Warm Gold', color: '#422006' },
  { id: 'emerald', label: 'Emerald', color: '#064e3b' },
] as const

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SLIDE_SELECT =
  'id, bg_color, eyebrow, title, speakers, created_at, updated_at' as const
const SLIDE_SELECT_NO_UPDATED =
  'id, bg_color, eyebrow, title, speakers, created_at' as const

export function isDisplaySlideId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

function isMissingUpdatedAtColumn(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('updated_at') &&
    (m.includes('schema cache') ||
      m.includes('could not find') ||
      m.includes('does not exist') ||
      m.includes('column'))
  )
}

function isMissingCreatedAtColumn(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('created_at') &&
    (m.includes('schema cache') ||
      m.includes('could not find') ||
      m.includes('does not exist') ||
      m.includes('column'))
  )
}

function parseSpeakers(value: unknown): DisplaySlideSpeaker[] {
  if (!Array.isArray(value)) return []
  const speakers: DisplaySlideSpeaker[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const image_url = typeof row.image_url === 'string' ? row.image_url.trim() : ''
    if (!name && !image_url) continue
    speakers.push({ name, image_url })
  }
  return speakers
}

export function normalizeDisplaySlideRow(row: Record<string, unknown>): DisplaySlideRow | null {
  const id = typeof row.id === 'string' ? row.id : null
  if (!id) return null

  const createdAt =
    typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()

  return {
    id,
    bg_color:
      typeof row.bg_color === 'string' && row.bg_color.trim()
        ? row.bg_color.trim()
        : SLIDE_BG_PRESETS[0].color,
    eyebrow: typeof row.eyebrow === 'string' ? row.eyebrow : '',
    title: typeof row.title === 'string' ? row.title : '',
    speakers: parseSpeakers(row.speakers),
    created_at: createdAt,
    updated_at:
      typeof row.updated_at === 'string' ? row.updated_at : createdAt,
  }
}

function normalizeSlideRows(data: unknown[] | null | undefined): DisplaySlideRow[] {
  return (data ?? [])
    .map((row) => normalizeDisplaySlideRow(row as Record<string, unknown>))
    .filter((row): row is DisplaySlideRow => row !== null)
}

async function queryDisplaySlides(): Promise<DisplaySlideRow[]> {
  const primary = await supabase
    .from('display_slides')
    .select(SLIDE_SELECT)
    .order('created_at', { ascending: false })

  if (!primary.error) return normalizeSlideRows(primary.data)

  if (isMissingUpdatedAtColumn(primary.error.message)) {
    const withoutUpdated = await supabase
      .from('display_slides')
      .select(SLIDE_SELECT_NO_UPDATED)
      .order('created_at', { ascending: false })
    if (!withoutUpdated.error) return normalizeSlideRows(withoutUpdated.data)
  }

  if (isMissingCreatedAtColumn(primary.error.message)) {
    const unordered = await supabase.from('display_slides').select(SLIDE_SELECT_NO_UPDATED)
    if (!unordered.error) return normalizeSlideRows(unordered.data)
  }

  throw new Error(primary.error.message || 'Failed to load display slides.')
}

async function queryDisplaySlideById(id: string): Promise<DisplaySlideRow | null> {
  const primary = await supabase
    .from('display_slides')
    .select(SLIDE_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (!primary.error) {
    if (!primary.data) return null
    return normalizeDisplaySlideRow(primary.data as Record<string, unknown>)
  }

  if (isMissingUpdatedAtColumn(primary.error.message)) {
    const fallback = await supabase
      .from('display_slides')
      .select(SLIDE_SELECT_NO_UPDATED)
      .eq('id', id)
      .maybeSingle()
    if (!fallback.error) {
      if (!fallback.data) return null
      return normalizeDisplaySlideRow(fallback.data as Record<string, unknown>)
    }
  }

  throw new Error(primary.error.message || 'Failed to load display slide.')
}

export async function fetchDisplaySlides(): Promise<DisplaySlideRow[]> {
  return queryDisplaySlides()
}

export async function fetchDisplaySlideById(id: string): Promise<DisplaySlideRow | null> {
  const trimmed = id.trim()
  if (!trimmed) return null
  return queryDisplaySlideById(trimmed)
}

export async function createDisplaySlide(input: DisplaySlideInput): Promise<DisplaySlideRow> {
  const payload = {
    bg_color: input.bg_color.trim() || SLIDE_BG_PRESETS[0].color,
    eyebrow: input.eyebrow.trim(),
    title: input.title.trim(),
    speakers: input.speakers,
  }

  let result = await supabase
    .from('display_slides')
    .insert(payload)
    .select(SLIDE_SELECT)
    .single()

  if (result.error && isMissingUpdatedAtColumn(result.error.message)) {
    result = await supabase
      .from('display_slides')
      .insert(payload)
      .select(SLIDE_SELECT_NO_UPDATED)
      .single()
  }

  if (result.error) throw new Error(result.error.message || 'Failed to create slide.')
  const row = normalizeDisplaySlideRow(result.data as Record<string, unknown>)
  if (!row) throw new Error('Failed to parse created slide.')
  return row
}

export async function updateDisplaySlide(
  id: string,
  input: DisplaySlideInput
): Promise<DisplaySlideRow> {
  const payload = {
    bg_color: input.bg_color.trim() || SLIDE_BG_PRESETS[0].color,
    eyebrow: input.eyebrow.trim(),
    title: input.title.trim(),
    speakers: input.speakers,
    updated_at: new Date().toISOString(),
  }

  let result = await supabase
    .from('display_slides')
    .update(payload)
    .eq('id', id)
    .select(SLIDE_SELECT)
    .single()

  if (result.error && isMissingUpdatedAtColumn(result.error.message)) {
    const { updated_at: _ignored, ...payloadWithoutUpdated } = payload
    result = await supabase
      .from('display_slides')
      .update(payloadWithoutUpdated)
      .eq('id', id)
      .select(SLIDE_SELECT_NO_UPDATED)
      .single()
  }

  if (result.error) throw new Error(result.error.message || 'Failed to update slide.')
  const row = normalizeDisplaySlideRow(result.data as Record<string, unknown>)
  if (!row) throw new Error('Failed to parse updated slide.')
  return row
}

export async function deleteDisplaySlide(id: string): Promise<void> {
  const { error } = await supabase.from('display_slides').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Failed to delete slide.')
}
