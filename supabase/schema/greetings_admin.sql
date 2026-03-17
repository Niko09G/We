-- Admin MVP policies for greeting deletion (no auth).
-- Run in Supabase Dashboard → SQL Editor.
--
-- WARNING: This allows deletes with the anon key. Use only for MVP/testing.

-- Allow anonymous delete of greeting rows (since no auth exists yet).
create policy "Allow anonymous delete for greetings"
  on public.greetings
  for delete
  using (true);

-- OPTIONAL (only if you want /admin to delete storage objects too):
-- Storage policies are separate from table RLS. You must allow deletes on objects.
--
-- The exact policy depends on your project's current Storage RLS setup.
-- If Storage RLS is enabled, a common MVP policy looks like:
--
-- create policy "Allow anonymous delete for greetings bucket objects"
--   on storage.objects
--   for delete
--   using (bucket_id = 'greetings');

