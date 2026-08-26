export const DIETARY_RESTRICTION_OPTIONS = ['Gluten', 'Soy', 'Lactose'] as const

export type DietaryRestriction = (typeof DIETARY_RESTRICTION_OPTIONS)[number]

export type GuestLogisticsFields = {
  dietary_restrictions: string[]
  needs_baby_chair: boolean
  needs_kids_menu: boolean
  no_meal: boolean
}

const DIETARY_SET = new Set<string>(DIETARY_RESTRICTION_OPTIONS)

export function normalizeDietaryRestrictions(
  value: string[] | null | undefined
): DietaryRestriction[] {
  if (!value?.length) return []
  const out: DietaryRestriction[] = []
  for (const item of value) {
    const v = item.trim()
    if (DIETARY_SET.has(v) && !out.includes(v as DietaryRestriction)) {
      out.push(v as DietaryRestriction)
    }
  }
  return out
}

export function dietaryBadgeClass(restriction: string): string {
  switch (restriction) {
    case 'Gluten':
      return 'bg-amber-100 text-amber-900 border-amber-200'
    case 'Soy':
      return 'bg-orange-100 text-orange-900 border-orange-200'
    case 'Lactose':
      return 'bg-sky-100 text-sky-900 border-sky-200'
    default:
      return 'bg-zinc-100 text-zinc-800 border-zinc-200'
  }
}

export function guestHasDietaryRestrictions(
  restrictions: string[] | null | undefined
): boolean {
  return normalizeDietaryRestrictions(restrictions).length > 0
}
