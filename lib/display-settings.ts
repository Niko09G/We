import { supabase } from '@/lib/supabase/client'

import { isDisplaySlideId } from '@/lib/display-slides'

export const DISPLAY_ACTIVE_OVERLAY_KEY = 'active_overlay' as const
export const DISPLAY_ANNOUNCEMENT_TEXT_KEY = 'announcement_text' as const
export const DISPLAY_ACTIVE_SLIDE_ID_KEY = 'active_slide_id' as const

export type DisplayOverlayMode = 'leaderboard' | 'speech' | 'announcement' | 'slide'

export const DISPLAY_OVERLAY_MODES: DisplayOverlayMode[] = [
  'leaderboard',
  'speech',
  'announcement',
  'slide',
]

export function parseDisplayOverlayMode(value: unknown): DisplayOverlayMode {
  if (value === 'speech' || value === 'announcement' || value === 'slide') return value
  if (isDisplaySlideId(value)) return 'slide'
  return 'leaderboard'
}

export function parseActiveSlideId(value: unknown): string | null {
  return isDisplaySlideId(value) ? value.trim() : null
}

export function parseAnnouncementText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function fetchDisplayOverlayMode(): Promise<DisplayOverlayMode> {
  const { data, error } = await supabase
    .from('display_settings')
    .select('value')
    .eq('key', DISPLAY_ACTIVE_OVERLAY_KEY)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to load display overlay mode.')
  return parseDisplayOverlayMode((data as { value: unknown } | null)?.value)
}

export async function fetchAnnouncementText(): Promise<string> {
  const { data, error } = await supabase
    .from('display_settings')
    .select('value')
    .eq('key', DISPLAY_ANNOUNCEMENT_TEXT_KEY)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to load announcement text.')
  return parseAnnouncementText((data as { value: unknown } | null)?.value)
}

export async function fetchDisplayOverlayState(): Promise<{
  mode: DisplayOverlayMode
  announcementText: string
  activeSlideId: string | null
}> {
  const { data, error } = await supabase
    .from('display_settings')
    .select('key, value')
    .in('key', [
      DISPLAY_ACTIVE_OVERLAY_KEY,
      DISPLAY_ANNOUNCEMENT_TEXT_KEY,
      DISPLAY_ACTIVE_SLIDE_ID_KEY,
    ])

  if (error) throw new Error(error.message || 'Failed to load display settings.')

  let mode: DisplayOverlayMode = 'leaderboard'
  let announcementText = ''
  let activeSlideId: string | null = null

  for (const row of data ?? []) {
    const key = typeof row.key === 'string' ? row.key : null
    if (key === DISPLAY_ACTIVE_OVERLAY_KEY) {
      mode = parseDisplayOverlayMode(row.value)
      if (mode === 'slide' && isDisplaySlideId(row.value)) {
        activeSlideId = row.value.trim()
      }
    } else if (key === DISPLAY_ANNOUNCEMENT_TEXT_KEY) {
      announcementText = parseAnnouncementText(row.value)
    } else if (key === DISPLAY_ACTIVE_SLIDE_ID_KEY) {
      activeSlideId = parseActiveSlideId(row.value)
    }
  }

  if (mode === 'slide' && !activeSlideId) {
    mode = 'leaderboard'
  }

  return { mode, announcementText, activeSlideId }
}

export async function setDisplayOverlayMode(mode: DisplayOverlayMode): Promise<void> {
  const rows: { key: string; value: unknown }[] = [
    { key: DISPLAY_ACTIVE_OVERLAY_KEY, value: mode },
  ]

  if (mode !== 'slide') {
    rows.push({ key: DISPLAY_ACTIVE_SLIDE_ID_KEY, value: '' })
  }

  const { error } = await supabase.from('display_settings').upsert(rows, { onConflict: 'key' })

  if (error) throw new Error(error.message || 'Failed to update display overlay mode.')
}

export async function setAnnouncementText(text: string): Promise<void> {
  const { error } = await supabase.from('display_settings').upsert(
    {
      key: DISPLAY_ANNOUNCEMENT_TEXT_KEY,
      value: text,
    },
    { onConflict: 'key' }
  )

  if (error) throw new Error(error.message || 'Failed to update announcement text.')
}

export async function setDisplayAnnouncementMode(text: string): Promise<void> {
  const trimmed = text.trim()
  const { error } = await supabase.from('display_settings').upsert(
    [
      { key: DISPLAY_ANNOUNCEMENT_TEXT_KEY, value: trimmed },
      { key: DISPLAY_ACTIVE_OVERLAY_KEY, value: 'announcement' satisfies DisplayOverlayMode },
      { key: DISPLAY_ACTIVE_SLIDE_ID_KEY, value: '' },
    ],
    { onConflict: 'key' }
  )

  if (error) throw new Error(error.message || 'Failed to switch to announcement mode.')
}

export async function setActiveDisplaySlide(slideId: string): Promise<void> {
  const trimmed = slideId.trim()
  if (!isDisplaySlideId(trimmed)) {
    throw new Error('Invalid slide id.')
  }

  const { error } = await supabase.from('display_settings').upsert(
    [
      { key: DISPLAY_ACTIVE_OVERLAY_KEY, value: 'slide' satisfies DisplayOverlayMode },
      { key: DISPLAY_ACTIVE_SLIDE_ID_KEY, value: trimmed },
    ],
    { onConflict: 'key' }
  )

  if (error) throw new Error(error.message || 'Failed to activate slide on display.')
}

export function displayOverlayLabel(
  mode: DisplayOverlayMode,
  slideTitle?: string | null
): string {
  switch (mode) {
    case 'leaderboard':
      return 'Live Leaderboard & Feed'
    case 'speech':
      return 'Speech / Presentation'
    case 'announcement':
      return 'Custom Announcement'
    case 'slide':
      return slideTitle?.trim() ? slideTitle.trim() : 'Presenter Slide'
    default:
      return mode
  }
}
