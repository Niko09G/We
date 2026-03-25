/**
 * Canonical missions table schema. Use only these columns in code; do not use `name`.
 * DB: id, title, description, points, created_at, validation_type, approval_mode, is_active,
 *     add_to_greetings, allow_multiple_submissions, max_submissions_per_table, points_per_submission,
 *     target_person_name, submission_hint, header_title, header_image_url, message_required,
 *     card_theme_index, card_cover_image_url
 */
export type MissionsTableRow = {
  id: string
  title: string
  description: string | null
  points: number
  created_at: string
  validation_type: string
  approval_mode: string
  is_active: boolean
  add_to_greetings: boolean
  allow_multiple_submissions: boolean
  /** null = unlimited; 1 = one submission; N = cap (pending+approved per table). */
  max_submissions_per_table: number | null
  points_per_submission: number | null
  target_person_name: string | null
  submission_hint: string | null
  header_title: string | null
  header_image_url: string | null
  message_required: boolean
  /** 0–5 theme swatch; null = legacy carousel gradient. */
  card_theme_index: number | null
  /** Optional full-bleed card image. */
  card_cover_image_url: string | null
}
