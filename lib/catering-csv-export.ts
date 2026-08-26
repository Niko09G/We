import type { AttendeeRow } from '@/lib/admin-attendees'
import type { AdminTableRow } from '@/lib/admin-tables'
import { normalizeDietaryRestrictions } from '@/lib/guest-logistics'
import { physicalTableAdminLabel } from '@/lib/table-teams'

const CATERING_CSV_HEADERS = [
  'Table',
  'Name',
  'Seat No',
  'Allergies',
  'Baby Seat',
  'Kids Menu',
  'No Meal',
] as const

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function yesNo(flag: boolean): string {
  return flag ? 'Yes' : 'No'
}

function formatAllergies(restrictions: string[] | null | undefined): string {
  const normalized = normalizeDietaryRestrictions(restrictions)
  return normalized.length > 0 ? normalized.join(', ') : 'None'
}

function tableLabelForAttendee(
  attendee: AttendeeRow,
  tableById: Map<string, AdminTableRow>,
  tables: AdminTableRow[]
): string {
  if (!attendee.table_id) return ''
  const table = tableById.get(attendee.table_id)
  if (!table) return ''
  return physicalTableAdminLabel(table, tables)
}

function sortAttendeesForCateringExport(
  attendees: AttendeeRow[],
  tableById: Map<string, AdminTableRow>,
  tables: AdminTableRow[]
): AttendeeRow[] {
  return [...attendees].sort((a, b) => {
    const tableA = tableLabelForAttendee(a, tableById, tables)
    const tableB = tableLabelForAttendee(b, tableById, tables)
    const tableCmp = tableA.localeCompare(tableB, undefined, { sensitivity: 'base' })
    if (tableCmp !== 0) return tableCmp

    const seatA = a.seat_number ?? Number.POSITIVE_INFINITY
    const seatB = b.seat_number ?? Number.POSITIVE_INFINITY
    if (seatA !== seatB) return seatA - seatB

    return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
  })
}

export function buildCateringCsv(
  attendees: AttendeeRow[],
  tables: AdminTableRow[]
): string {
  const tableById = new Map(tables.map((t) => [t.id, t]))
  const sorted = sortAttendeesForCateringExport(attendees, tableById, tables)

  const lines = [
    CATERING_CSV_HEADERS.join(','),
    ...sorted.map((attendee) =>
      [
        tableLabelForAttendee(attendee, tableById, tables),
        attendee.full_name,
        attendee.seat_number != null ? String(attendee.seat_number) : '',
        formatAllergies(attendee.dietary_restrictions),
        yesNo(attendee.needs_baby_chair),
        yesNo(attendee.needs_kids_menu),
        yesNo(attendee.no_meal),
      ]
        .map(escapeCsvCell)
        .join(',')
    ),
  ]

  return `${lines.join('\r\n')}\r\n`
}

export function downloadCateringCsv(
  attendees: AttendeeRow[],
  tables: AdminTableRow[],
  filename = 'catering-export.csv'
): void {
  const csv = buildCateringCsv(attendees, tables)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
