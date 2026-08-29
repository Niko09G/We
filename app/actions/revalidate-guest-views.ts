'use server'

import { revalidatePath } from 'next/cache'

/** Bust Next.js caches for guest views that show team names. */
export async function revalidateGuestTeamViews(): Promise<void> {
  revalidatePath('/')
  revalidatePath('/seat')
  revalidatePath('/program')
  revalidatePath('/missions')
  revalidatePath('/display')
  revalidatePath('/missions/[tableId]', 'layout')
}
