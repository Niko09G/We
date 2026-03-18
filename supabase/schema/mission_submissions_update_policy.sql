-- Allow anonymous updates on mission_submissions (admin MVP; replace with auth later).
-- Run in Supabase SQL Editor if approve/reject from /admin fails with RLS.

create policy "Allow anon update mission_submissions"
  on public.mission_submissions
  for update
  using (true)
  with check (true);
