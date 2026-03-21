import type { GreetingRow } from '@/lib/greetings-admin'

/** Sender line for cards / lightbox (matches display page semantics). */
export function greetingSenderLabel(g: GreetingRow): string {
  if (g.source_type === 'mission') {
    return g.table_name?.trim() || g.name?.trim() || 'Table'
  }
  return g.name?.trim() || 'Anonymous'
}

export function previewMessage(message: string, maxChars = 72): string {
  const t = message.trim().replace(/\s+/g, ' ')
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars).trimEnd()}…`
}
