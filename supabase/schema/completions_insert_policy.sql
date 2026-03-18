-- Allow anonymous insert into completions (admin MVP; replace with auth later).
-- Run in Supabase SQL Editor if inserts from the app fail with RLS.

create policy "Allow anonymous insert completions"
  on public.completions
  for insert
  with check (true);
