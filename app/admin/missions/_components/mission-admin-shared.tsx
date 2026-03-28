import { MISSION_CARD_THEME_LABELS } from '@/lib/guest-missions-gradients'

export { MissionCategoryTypeIcon } from '@/components/mission/MissionCategoryTypeIcon'

export function themeLabel(index: number | null): string {
  if (index == null) return 'Auto'
  const labels = MISSION_CARD_THEME_LABELS
  if (index >= 0 && index < labels.length) return labels[index]!
  return 'Auto'
}
