import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client (bypasses RLS). Use only in server Route Handlers / Server Actions.
 * Required for admin token management because `beatcoin_tokens` has RLS with no anon policies.
 *
 * Set `SUPABASE_SERVICE_ROLE_KEY` in the server environment (never expose to the browser).
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (needed for admin token APIs).'
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
