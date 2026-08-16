-- Host-facilitated missions: points awarded live by event staff (no guest submission).
-- Run in Supabase SQL Editor after beatcoin_tokens.sql.

alter table public.missions
  drop constraint if exists missions_validation_type_check;

alter table public.missions
  add constraint missions_validation_type_check
  check (validation_type in ('photo', 'video', 'signature', 'text', 'beatcoin', 'host_facilitated'));

alter table public.mission_submissions
  drop constraint if exists mission_submissions_submission_type_check;

alter table public.mission_submissions
  add constraint mission_submissions_submission_type_check
  check (submission_type in ('photo', 'video', 'signature', 'text', 'beatcoin', 'host_facilitated'));
