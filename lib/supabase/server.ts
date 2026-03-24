import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client for server-side code (Route Handlers, Server Actions).
 * Uses the same anon key + RLS as the browser client.
 * Mission submission writes should go through POST /api/missions/submit (see lib/mission-submission-core.ts).
 */
export function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient(url, key)
}
