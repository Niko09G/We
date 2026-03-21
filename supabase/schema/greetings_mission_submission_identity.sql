-- Mission-generated greeting link to the specific mission_submissions row.
-- Run manually in Supabase SQL Editor. Do not execute automatically.

alter table public.greetings
  add column if not exists mission_submission_id uuid null references public.mission_submissions(id) on delete set null;

