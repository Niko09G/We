/**
 * Canonical missions table schema. Use only these columns in code; do not use `name`.
 * DB columns: id, title, description, points, created_at, validation_type, is_active
 */
export type MissionsTableRow = {
  id: string
  title: string
  description: string | null
  points: number
  created_at: string
  validation_type: string
  is_active: boolean
}
