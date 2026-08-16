import { supabase } from '@/lib/supabase/client'

export const LOBBY_SETTINGS_KEY = 'lobby_settings' as const

export type LobbyModuleId = 'seat-finder' | 'event-program' | 'mcs' | 'teams'

export const LOBBY_MODULE_IDS: LobbyModuleId[] = [
  'seat-finder',
  'event-program',
  'mcs',
  'teams',
]

export type LobbyModuleConfig = {
  enabled: boolean
  title: string
  description: string | null
}

export type LobbyProgramItem = {
  id: string
  time: string
  title: string
  description: string | null
}

export type LobbyMc = {
  id: 'mc1' | 'mc2'
  name: string
  description: string
  photo_url: string | null
}

export type LobbyHeroSettings = {
  title: string
  description: string
  cta_find_seat_label: string
  cta_program_label: string
}

export type LobbySettings = {
  hero: LobbyHeroSettings
  header_logo_url: string | null
  hero_background_url: string | null
  modules_order: LobbyModuleId[]
  modules: Record<LobbyModuleId, LobbyModuleConfig>
  event_program: LobbyProgramItem[]
  mcs: [LobbyMc, LobbyMc]
}

const DEFAULT_MODULES: Record<LobbyModuleId, LobbyModuleConfig> = {
  'seat-finder': { enabled: true, title: 'Find your seat', description: null },
  'event-program': { enabled: true, title: 'Event Program', description: null },
  mcs: { enabled: true, title: 'Meet the MCs', description: null },
  teams: {
    enabled: true,
    title: 'Teams',
    description:
      'Your table reflects your team. See where you belong in the Seat Finder.',
  },
}

const DEFAULT_MCS: [LobbyMc, LobbyMc] = [
  {
    id: 'mc1',
    name: 'MC One',
    description: 'Your host for the evening.',
    photo_url: null,
  },
  {
    id: 'mc2',
    name: 'MC Two',
    description: 'Keeping the energy high all night.',
    photo_url: null,
  },
]

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  hero: {
    title: 'Welcome',
    description:
      'Find your spot, explore the program, and join your table for the celebration.',
    cta_find_seat_label: 'Find My Seat',
    cta_program_label: 'See the Program',
  },
  header_logo_url: null,
  hero_background_url: null,
  modules_order: [...LOBBY_MODULE_IDS],
  modules: { ...DEFAULT_MODULES },
  event_program: [],
  mcs: [...DEFAULT_MCS],
}

function cleanStr(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const t = value.trim()
    return t || fallback
  }
  return fallback
}

function cleanNullableStr(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return t || null
  }
  return null
}

function parseModuleId(value: unknown): LobbyModuleId | null {
  if (typeof value !== 'string') return null
  return LOBBY_MODULE_IDS.includes(value as LobbyModuleId)
    ? (value as LobbyModuleId)
    : null
}

function parseModuleConfig(value: unknown, fallback: LobbyModuleConfig): LobbyModuleConfig {
  if (!value || typeof value !== 'object') return fallback
  const o = value as Record<string, unknown>
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : fallback.enabled,
    title: cleanStr(o.title, fallback.title),
    description:
      o.description === null
        ? null
        : cleanNullableStr(o.description) ?? fallback.description,
  }
}

function parseProgramItem(value: unknown): LobbyProgramItem | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  const id = cleanStr(o.id, '')
  const time = cleanStr(o.time, '')
  const title = cleanStr(o.title, '')
  if (!id || !time || !title) return null
  return {
    id,
    time,
    title,
    description: cleanNullableStr(o.description),
  }
}

function parseMc(value: unknown, fallback: LobbyMc): LobbyMc {
  if (!value || typeof value !== 'object') return fallback
  const o = value as Record<string, unknown>
  return {
    id: fallback.id,
    name: cleanStr(o.name, fallback.name),
    description: cleanStr(o.description, fallback.description),
    photo_url: cleanNullableStr(o.photo_url),
  }
}

export function parseLobbySettings(value: unknown): LobbySettings {
  if (value == null || typeof value !== 'object') return DEFAULT_LOBBY_SETTINGS
  const o = value as Record<string, unknown>

  const heroRaw = o.hero
  const heroObj =
    heroRaw && typeof heroRaw === 'object' ? (heroRaw as Record<string, unknown>) : {}

  const modules: Record<LobbyModuleId, LobbyModuleConfig> = { ...DEFAULT_MODULES }
  const modulesRaw = o.modules
  if (modulesRaw && typeof modulesRaw === 'object') {
    for (const id of LOBBY_MODULE_IDS) {
      modules[id] = parseModuleConfig(
        (modulesRaw as Record<string, unknown>)[id],
        DEFAULT_MODULES[id]
      )
    }
  }

  const orderRaw = Array.isArray(o.modules_order) ? o.modules_order : []
  const seen = new Set<LobbyModuleId>()
  const modules_order: LobbyModuleId[] = []
  for (const item of orderRaw) {
    const id = parseModuleId(item)
    if (!id || seen.has(id)) continue
    seen.add(id)
    modules_order.push(id)
  }
  for (const id of LOBBY_MODULE_IDS) {
    if (!seen.has(id)) modules_order.push(id)
  }

  const event_program = (Array.isArray(o.event_program) ? o.event_program : [])
    .map(parseProgramItem)
    .filter((item): item is LobbyProgramItem => item != null)

  const mcsRaw = Array.isArray(o.mcs) ? o.mcs : []
  const mcs: [LobbyMc, LobbyMc] = [
    parseMc(mcsRaw[0], DEFAULT_MCS[0]),
    parseMc(mcsRaw[1], DEFAULT_MCS[1]),
  ]

  return {
    hero: {
      title: cleanStr(heroObj.title, DEFAULT_LOBBY_SETTINGS.hero.title),
      description: cleanStr(heroObj.description, DEFAULT_LOBBY_SETTINGS.hero.description),
      cta_find_seat_label: cleanStr(
        heroObj.cta_find_seat_label,
        DEFAULT_LOBBY_SETTINGS.hero.cta_find_seat_label
      ),
      cta_program_label: cleanStr(
        heroObj.cta_program_label,
        DEFAULT_LOBBY_SETTINGS.hero.cta_program_label
      ),
    },
    header_logo_url: cleanNullableStr(o.header_logo_url),
    hero_background_url: cleanNullableStr(o.hero_background_url),
    modules_order,
    modules,
    event_program,
    mcs,
  }
}

export function lobbyModuleLabel(id: LobbyModuleId): string {
  switch (id) {
    case 'seat-finder':
      return 'Seat Finder'
    case 'event-program':
      return 'Event Program'
    case 'mcs':
      return 'Meet the MCs'
    case 'teams':
      return 'Teams'
    default:
      return id
  }
}

export async function fetchLobbySettings(): Promise<LobbySettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', LOBBY_SETTINGS_KEY)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to load lobby settings.')
  return parseLobbySettings((data as { value: unknown } | null)?.value)
}

export async function setLobbySettings(settings: LobbySettings): Promise<void> {
  const row = parseLobbySettings(settings)
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: LOBBY_SETTINGS_KEY,
      value: row,
    },
    { onConflict: 'key' }
  )

  if (error) throw new Error(error.message || 'Failed to save lobby settings.')
}
