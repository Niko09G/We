import { supabase } from '@/lib/supabase/client'

function coerceJsonbToBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value && typeof value === 'object' && 'value' in (value as any)) {
    return Boolean((value as any).value)
  }
  return true // default: enabled
}

export async function getMissionsEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'missions_enabled')
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to load app settings.')
  return coerceJsonbToBoolean((data as { value: unknown } | null)?.value)
}

export async function setMissionsEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: 'missions_enabled',
        value: enabled,
      },
      { onConflict: 'key' }
    )

  if (error) throw new Error(error.message || 'Failed to update mission lock.')
}

