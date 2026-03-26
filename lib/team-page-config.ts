/**
 * Structured config for guest “team” pages (/missions/[tableId]).
 * Stored in `tables.page_config` (JSONB). All fields optional; parser fills defaults.
 */

export type TeamPageHeroGradient = {
  colorTop: string
  colorMiddle?: string
  colorBottom: string
}

export type TeamPageHeroImage = {
  /** Public URL or site-relative path */
  url: string | null
}

export type TeamPageHeroConfig = {
  backgroundGradient: TeamPageHeroGradient
  heroImage: TeamPageHeroImage
  /** Copy under HUD, above CTAs */
  teamText: string
}

export type TeamPageThemeGradientStop = {
  colorTop: string
  colorBottom: string
}

export type TeamPageThemeConfig = {
  primaryColor: string
  tableGradient: TeamPageThemeGradientStop
  leaderboardGradient: TeamPageThemeGradientStop
  iconColor: string
}

export type TeamPageTypographyConfig = {
  textColorPrimary: string
  textColorSecondary: string
}

export type TeamPageConfigRaw = {
  hero?: Partial<{
    backgroundGradient: Partial<TeamPageHeroGradient>
    heroImage: Partial<TeamPageHeroImage>
    teamText: string
  }>
  theme?: Partial<TeamPageThemeConfig> & {
    tableGradient?: Partial<TeamPageThemeGradientStop>
    leaderboardGradient?: Partial<TeamPageThemeGradientStop>
  }
  typography?: Partial<TeamPageTypographyConfig>
}

/** Fully merged config (no undefined leaves in nested required shapes). */
export type ResolvedTeamPageConfig = {
  hero: TeamPageHeroConfig
  theme: TeamPageThemeConfig
  typography: TeamPageTypographyConfig
}

const DEFAULT_HERO_GRADIENT: TeamPageHeroGradient = {
  colorTop: '#6b21a8',
  colorMiddle: '#7c3aed',
  colorBottom: '#fafafa',
}

const DEFAULT_THEME_PRIMARY = '#6335fb'
const DEFAULT_ICON = '#ffffff'

/** Luminance of sRGB channel 0–255 (WCAG relative luminance). */
function relativeLuminance255(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const v = Math.max(0, Math.min(255, c)) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function rgbChannelsFromCssColor(color: string): [number, number, number] | null {
  const s = color.trim()
  const hex8 = /^#([0-9A-Fa-f]{8})$/i
  const hex6 = /^#([0-9A-Fa-f]{6})$/i
  const hex3 = /^#([0-9A-Fa-f]{3})$/i
  let m = s.match(hex6)
  if (m) {
    const h = m[1]!
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  m = s.match(hex8)
  if (m) {
    const h = m[1]!
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  m = s.match(hex3)
  if (m) {
    const h = m[1]!
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
    ]
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (rgb) {
    const clamp = (x: string) => Math.max(0, Math.min(255, Math.round(Number(x))))
    return [clamp(rgb[1]!), clamp(rgb[2]!), clamp(rgb[3]!)]
  }
  return null
}

/**
 * Keep primary CTA fills dark enough for white label text.
 * Unparseable tokens (e.g. `color-mix`) are left unchanged.
 */
export function ensureReadableColor(color: string, fallback: string = DEFAULT_THEME_PRIMARY): string {
  const raw = (color ?? '').trim()
  if (!raw) return fallback

  if (/^color-mix\(/i.test(raw)) return raw

  const rgb = rgbChannelsFromCssColor(raw)
  if (!rgb) return fallback

  const L = relativeLuminance255(rgb[0], rgb[1], rgb[2])
  if (L > 0.72) return fallback
  return raw
}

function cleanStr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function cleanHexLike(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (/^#[0-9A-Fa-f]{3,8}$/i.test(s)) return s
  if (/^rgb(a)?\(/i.test(s)) return s
  return fallback
}

function parseGradientStop(
  raw: Record<string, unknown> | undefined,
  fallTop: string,
  fallBot: string
): TeamPageThemeGradientStop {
  if (!raw || typeof raw !== 'object') {
    return { colorTop: fallTop, colorBottom: fallBot }
  }
  const o = raw as Record<string, unknown>
  return {
    colorTop: cleanHexLike(o.colorTop, fallTop),
    colorBottom: cleanHexLike(o.colorBottom, fallBot),
  }
}

function heroCssBackground(g: TeamPageHeroGradient): string {
  if (g.colorMiddle && g.colorMiddle.trim()) {
    return `linear-gradient(to bottom, ${g.colorTop}, ${g.colorMiddle}, ${g.colorBottom})`
  }
  return `linear-gradient(to bottom, ${g.colorTop}, ${g.colorBottom})`
}

function defaultTeamText(tableName: string): string {
  const n = tableName.trim() || 'Your table'
  return `${n} — join the wedding game and stack up your table’s score.`
}

/**
 * Merge raw JSON from DB with table fallback color and display name.
 */
export function resolveTeamPageConfig(
  raw: unknown,
  opts: { tableColor: string | null; tableName: string }
): ResolvedTeamPageConfig {
  const tableHex = cleanHexLike(opts.tableColor, DEFAULT_THEME_PRIMARY)
  const base = typeof raw === 'object' && raw !== null ? (raw as TeamPageConfigRaw) : {}

  const hg = base.hero?.backgroundGradient
  const heroGradient: TeamPageHeroGradient = {
    colorTop: cleanHexLike(hg?.colorTop, DEFAULT_HERO_GRADIENT.colorTop),
    colorMiddle: hg?.colorMiddle ? cleanHexLike(hg.colorMiddle, '') : undefined,
    colorBottom: cleanHexLike(hg?.colorBottom, DEFAULT_HERO_GRADIENT.colorBottom),
  }
  if (heroGradient.colorMiddle === '') delete heroGradient.colorMiddle

  const heroImageUrl =
    typeof base.hero?.heroImage?.url === 'string' && base.hero.heroImage.url.trim()
      ? base.hero.heroImage.url.trim()
      : null

  const th = base.theme ?? {}
  const tableGrad = parseGradientStop(
    th.tableGradient as Record<string, unknown> | undefined,
    tableHex,
    `color-mix(in srgb, ${tableHex} 65%, #ffffff)`
  )

  const hasExplicitLeaderboard =
    typeof th === 'object' &&
    th !== null &&
    'leaderboardGradient' in th &&
    th.leaderboardGradient != null &&
    typeof th.leaderboardGradient === 'object'

  const lbGrad = hasExplicitLeaderboard
    ? parseGradientStop(
        th.leaderboardGradient as Record<string, unknown>,
        tableGrad.colorTop,
        tableGrad.colorBottom
      )
    : { colorTop: tableGrad.colorTop, colorBottom: tableGrad.colorBottom }

  const theme: TeamPageThemeConfig = {
    primaryColor: ensureReadableColor(
      cleanHexLike(th.primaryColor, tableHex),
      DEFAULT_THEME_PRIMARY
    ),
    tableGradient: tableGrad,
    leaderboardGradient: lbGrad,
    iconColor: cleanHexLike(th.iconColor, DEFAULT_ICON),
  }

  const ty = base.typography ?? {}
  const typography: TeamPageTypographyConfig = {
    textColorPrimary: cleanHexLike(ty.textColorPrimary, '#18181b'),
    textColorSecondary: cleanHexLike(ty.textColorSecondary, '#71717a'),
  }

  const hero: TeamPageHeroConfig = {
    backgroundGradient: heroGradient,
    heroImage: { url: heroImageUrl },
    teamText: cleanStr(base.hero?.teamText, defaultTeamText(opts.tableName)),
  }

  return { hero, theme, typography }
}

export function heroBackgroundStyle(resolved: ResolvedTeamPageConfig): { background: string } {
  return { background: heroCssBackground(resolved.hero.backgroundGradient) }
}

/** Leaderboard row fill: row accent from API, tuned by page theme bottom stop. */
export function leaderboardRowFill(
  rowTableColor: string | null,
  page: ResolvedTeamPageConfig
): string {
  const raw = (rowTableColor ?? '').trim()
  const top = /^#[0-9A-Fa-f]{3,8}$/i.test(raw)
    ? raw
    : cleanHexLike(rowTableColor, page.theme.leaderboardGradient.colorTop)
  const bottom = page.theme.leaderboardGradient.colorBottom
  return `linear-gradient(to bottom, ${top} 0%, ${bottom} 100%)`
}

/** Flat form model for the admin team-page editor (maps to `tables.page_config`). */
export type TeamPageAdminFormValues = {
  heroTop: string
  heroMiddle: string
  heroBottom: string
  heroImageUrl: string
  teamText: string
  primaryColor: string
  tableGradTop: string
  tableGradBottom: string
  lbGradTop: string
  lbGradBottom: string
  iconColor: string
  textPrimary: string
  textSecondary: string
}

/**
 * Pre-fill admin fields: merge stored JSON with the same defaults as the guest page.
 */
export function teamPageAdminFormDefaults(
  raw: unknown,
  opts: { tableColor: string | null; tableName: string }
): TeamPageAdminFormValues {
  const r = resolveTeamPageConfig(raw, opts)
  return {
    heroTop: r.hero.backgroundGradient.colorTop,
    heroMiddle: r.hero.backgroundGradient.colorMiddle ?? '',
    heroBottom: r.hero.backgroundGradient.colorBottom,
    heroImageUrl: r.hero.heroImage.url ?? '',
    teamText: r.hero.teamText,
    primaryColor: r.theme.primaryColor,
    tableGradTop: r.theme.tableGradient.colorTop,
    tableGradBottom: r.theme.tableGradient.colorBottom,
    lbGradTop: r.theme.leaderboardGradient.colorTop,
    lbGradBottom: r.theme.leaderboardGradient.colorBottom,
    iconColor: r.theme.iconColor,
    textPrimary: r.typography.textColorPrimary,
    textSecondary: r.typography.textColorSecondary,
  }
}

/** Persistable JSON for `tables.page_config`. */
export function pageConfigJsonFromAdminForm(v: TeamPageAdminFormValues): TeamPageConfigRaw {
  return {
    hero: {
      backgroundGradient: {
        colorTop: v.heroTop.trim(),
        colorBottom: v.heroBottom.trim(),
        ...(v.heroMiddle.trim() ? { colorMiddle: v.heroMiddle.trim() } : {}),
      },
      heroImage: { url: v.heroImageUrl.trim() || null },
      teamText: v.teamText,
    },
    theme: {
      primaryColor: v.primaryColor.trim(),
      tableGradient: {
        colorTop: v.tableGradTop.trim(),
        colorBottom: v.tableGradBottom.trim(),
      },
      leaderboardGradient: {
        colorTop: v.lbGradTop.trim(),
        colorBottom: v.lbGradBottom.trim(),
      },
      iconColor: v.iconColor.trim(),
    },
    typography: {
      textColorPrimary: v.textPrimary.trim(),
      textColorSecondary: v.textSecondary.trim(),
    },
  }
}
