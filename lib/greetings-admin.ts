import { supabase } from '@/lib/supabase/client'

export type GreetingRow = {
  id: string
  name: string | null
  message: string
  image_url: string
  status: string
  created_at: string
}

export async function listGreetings(): Promise<GreetingRow[]> {
  const { data, error } = await supabase
    .from('greetings')
    .select('id,name,message,image_url,status,created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load greetings.')
  return (data ?? []) as GreetingRow[]
}
