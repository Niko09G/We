import { MISSION_CARD_THEME_LABELS } from '@/lib/guest-missions-gradients'

export function missionTypeIcon(type: string): string {
  if (type === 'photo') return '📷'
  if (type === 'video') return '🎥'
  if (type === 'signature') return '✍️'
  if (type === 'text') return '📝'
  if (type === 'beatcoin') return '🪙'
  return '•'
}

export function themeLabel(index: number | null): string {
  if (index == null) return 'Auto'
  const labels = MISSION_CARD_THEME_LABELS
  if (index >= 0 && index < labels.length) return labels[index]!
  return 'Auto'
}
