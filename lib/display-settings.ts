import { supabase } from '@/lib/supabase/client'

export const DISPLAY_ACTIVE_OVERLAY_KEY = 'active_overlay' as const
export const DISPLAY_ANNOUNCEMENT_TEXT_KEY = 'announcement_text' as const

export type DisplayOverlayMode = 'leaderboard' | 'speech' | 'announcement'

export const DISPLAY_OVERLAY_MODES: DisplayOverlayMode[] = [
  'leaderboard',
  'speech',
  'announcement',
]

export function parseDisplayOverlayMode(value: unknown): DisplayOverlayMode {
  if (value === 'speech' || value === 'announcement') return value
  return 'leaderboard'
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
}> {
  const { data, error } = await supabase
    .from('display_settings')
    .select('key, value')
    .in('key', [DISPLAY_ACTIVE_OVERLAY_KEY, DISPLAY_ANNOUNCEMENT_TEXT_KEY])

  if (error) throw new Error(error.message || 'Failed to load display settings.')

  let mode: DisplayOverlayMode = 'leaderboard'
  let announcementText = ''

  for (const row of data ?? []) {
    const key = typeof row.key === 'string' ? row.key : null
    if (key === DISPLAY_ACTIVE_OVERLAY_KEY) {
      mode = parseDisplayOverlayMode(row.value)
    } else if (key === DISPLAY_ANNOUNCEMENT_TEXT_KEY) {
      announcementText = parseAnnouncementText(row.value)
    }
  }

  return { mode, announcementText }
}

export async function setDisplayOverlayMode(mode: DisplayOverlayMode): Promise<void> {
  const { error } = await supabase.from('display_settings').upsert(
    {
      key: DISPLAY_ACTIVE_OVERLAY_KEY,
      value: mode,
    },
    { onConflict: 'key' }
  )

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
    ],
    { onConflict: 'key' }
  )

  if (error) throw new Error(error.message || 'Failed to switch to announcement mode.')
}

export function displayOverlayLabel(mode: DisplayOverlayMode): string {
  switch (mode) {
    case 'leaderboard':
      return 'Live Leaderboard & Feed'
    case 'speech':
      return 'Speech / Presentation'
    case 'announcement':
      return 'Custom Announcement'
    default:
      return mode
  }
}
