import { parseCsv } from '@/lib/csv-parse'

/** `undefined` on optional fields = column absent in CSV (do not overwrite on merge). */
export type ParsedAttendeeRow = {
  full_name: string
  email?: string | null
  phone?: string | null
  rsvp_status?: string | null
}

type CsvColumnKey =
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'rsvp_status'

const HEADER_TO_COLUMN: Record<string, CsvColumnKey> = {
  name: 'full_name',
  full_name: 'full_name',
  'full name': 'full_name',
  guest: 'full_name',
  attendee: 'full_name',
  first_name: 'first_name',
  firstname: 'first_name',
  first: 'first_name',
  'first name': 'first_name',
  given_name: 'first_name',
  'given name': 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  last: 'last_name',
  'last name': 'last_name',
  surname: 'last_name',
  'family name': 'last_name',
  email: 'email',
  'e-mail': 'email',
  mail: 'email',
  phone: 'phone',
  mobile: 'phone',
  telephone: 'phone',
  rsvp: 'rsvp_status',
  rsvp_status: 'rsvp_status',
  status: 'rsvp_status',
  attending: 'rsvp_status',
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
}

export function normalizeAttendeeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function normalizeAttendeeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Map common RSVP cell values to yes | no | pending; otherwise trimmed or null. */
export function normalizeRsvp(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (['yes', 'y', 'true', '1', 'attending', 'accepted', 'going'].includes(s))
    return 'yes'
  if (
    ['no', 'n', 'false', '0', 'declined', 'not attending', 'cant', "can't"].includes(
      s
    )
  )
    return 'no'
  if (['pending', 'maybe', 'tbd', 'unknown', '?', 'unsure'].includes(s))
    return 'pending'
  return s
}

function mapHeaderToColumn(cell: string): CsvColumnKey | null {
  const underscored = normHeader(cell).replace(/\s+/g, '_')
  const spaced = normHeader(cell)
  return HEADER_TO_COLUMN[underscored] ?? HEADER_TO_COLUMN[spaced] ?? null
}

function cellAt(line: string[], colIndex: Partial<Record<CsvColumnKey, number>>, key: CsvColumnKey) {
  const i = colIndex[key]
  if (i == null) return ''
  return line[i]?.trim() ?? ''
}

/**
 * Build display name from split columns and/or full name column.
 * - If First and/or Last columns exist: combine (First + Last); if both empty, fall back to full name column.
 * - If only full name column exists: use it.
 * - If only first name (no last): use first.
 */
export function buildFullNameFromCsvRow(
  line: string[],
  colIndex: Partial<Record<CsvColumnKey, number>>
): string {
  const hasSplit =
    colIndex.first_name !== undefined || colIndex.last_name !== undefined

  if (hasSplit) {
    const first = cellAt(line, colIndex, 'first_name')
    const last = cellAt(line, colIndex, 'last_name')
    const combined = [first, last].filter((p) => p.length > 0).join(' ').trim()
    if (combined) return combined.replace(/\s+/g, ' ')
    if (colIndex.full_name !== undefined) {
      const f = cellAt(line, colIndex, 'full_name').trim()
      if (f) return f.replace(/\s+/g, ' ')
    }
    return ''
  }

  if (colIndex.full_name !== undefined) {
    const f = cellAt(line, colIndex, 'full_name').trim()
    return f.replace(/\s+/g, ' ')
  }

  return ''
}

/**
 * Parse CSV text; first row must be headers.
 * Name: either a single column (name, full_name, …) OR First + Last (Last optional).
 */
export function attendeeRowsFromCsv(text: string): {
  rows: ParsedAttendeeRow[]
  errors: string[]
} {
  const errors: string[] = []
  const grid = parseCsv(text.trim())
  if (grid.length === 0) {
    errors.push('CSV is empty.')
    return { rows: [], errors }
  }

  const headerLine = grid[0]!
  const colIndex: Partial<Record<CsvColumnKey, number>> = {}
  headerLine.forEach((cell, i) => {
    const col = mapHeaderToColumn(cell)
    if (col && colIndex[col] === undefined) {
      colIndex[col] = i
    }
  })

  const hasFull = colIndex.full_name !== undefined
  const hasSplit =
    colIndex.first_name !== undefined || colIndex.last_name !== undefined

  if (!hasFull && !hasSplit) {
    errors.push(
      'Missing name columns. Use one of: name / full_name / "Full name", or "First name" + "Last name".'
    )
    return { rows: [], errors }
  }

  const rows: ParsedAttendeeRow[] = []
  for (let r = 1; r < grid.length; r++) {
    const line = grid[r]!
    const full_name = buildFullNameFromCsvRow(line, colIndex)
    if (!full_name) {
      errors.push(`Row ${r + 1}: skipped — empty name.`)
      continue
    }

    const out: ParsedAttendeeRow = { full_name }

    if (colIndex.email !== undefined) {
      const emailRaw = cellAt(line, colIndex, 'email').trim()
      out.email = emailRaw ? normalizeAttendeeEmail(emailRaw) : null
    }
    if (colIndex.phone !== undefined) {
      const phoneRaw = cellAt(line, colIndex, 'phone').trim()
      out.phone = phoneRaw || null
    }
    if (colIndex.rsvp_status !== undefined) {
      out.rsvp_status = normalizeRsvp(cellAt(line, colIndex, 'rsvp_status'))
    }

    rows.push(out)
  }

  return { rows, errors }
}
