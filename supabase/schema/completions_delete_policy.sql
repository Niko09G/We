-- Allow anonymous DELETE on completions (admin scoreboard reset / undo).
-- Without this, RLS blocks all deletes on public.completions (only SELECT + INSERT exist
-- in leaderboard.sql + completions_insert_policy.sql), so /admin/scoreboard cannot
-- remove manual completion scoring.
--
-- Run in Supabase Dashboard → SQL Editor (MVP; lock down with auth later).

create policy "Allow anonymous delete completions"
  on public.completions
  for delete
  using (true);
