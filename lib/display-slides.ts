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

export function isDisplaySlideId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
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

  return {
    id,
    bg_color:
      typeof row.bg_color === 'string' && row.bg_color.trim()
        ? row.bg_color.trim()
        : SLIDE_BG_PRESETS[0].color,
    eyebrow: typeof row.eyebrow === 'string' ? row.eyebrow : '',
    title: typeof row.title === 'string' ? row.title : '',
    speakers: parseSpeakers(row.speakers),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  }
}

export async function fetchDisplaySlides(): Promise<DisplaySlideRow[]> {
  const { data, error } = await supabase
    .from('display_slides')
    .select('id, bg_color, eyebrow, title, speakers, created_at, updated_at')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message || 'Failed to load display slides.')

  return (data ?? [])
    .map((row) => normalizeDisplaySlideRow(row as Record<string, unknown>))
    .filter((row): row is DisplaySlideRow => row !== null)
}

export async function fetchDisplaySlideById(id: string): Promise<DisplaySlideRow | null> {
  const trimmed = id.trim()
  if (!trimmed) return null

  const { data, error } = await supabase
    .from('display_slides')
    .select('id, bg_color, eyebrow, title, speakers, created_at, updated_at')
    .eq('id', trimmed)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to load display slide.')
  if (!data) return null
  return normalizeDisplaySlideRow(data as Record<string, unknown>)
}

export async function createDisplaySlide(input: DisplaySlideInput): Promise<DisplaySlideRow> {
  const { data, error } = await supabase
    .from('display_slides')
    .insert({
      bg_color: input.bg_color.trim() || SLIDE_BG_PRESETS[0].color,
      eyebrow: input.eyebrow.trim(),
      title: input.title.trim(),
      speakers: input.speakers,
    })
    .select('id, bg_color, eyebrow, title, speakers, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message || 'Failed to create slide.')
  const row = normalizeDisplaySlideRow(data as Record<string, unknown>)
  if (!row) throw new Error('Failed to parse created slide.')
  return row
}

export async function updateDisplaySlide(
  id: string,
  input: DisplaySlideInput
): Promise<DisplaySlideRow> {
  const { data, error } = await supabase
    .from('display_slides')
    .update({
      bg_color: input.bg_color.trim() || SLIDE_BG_PRESETS[0].color,
      eyebrow: input.eyebrow.trim(),
      title: input.title.trim(),
      speakers: input.speakers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, bg_color, eyebrow, title, speakers, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message || 'Failed to update slide.')
  const row = normalizeDisplaySlideRow(data as Record<string, unknown>)
  if (!row) throw new Error('Failed to parse updated slide.')
  return row
}

export async function deleteDisplaySlide(id: string): Promise<void> {
  const { error } = await supabase.from('display_slides').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Failed to delete slide.')
}
