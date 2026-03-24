-- Text mission type + capped submissions per table.
-- Run in Supabase Dashboard → SQL Editor after prior mission migrations.
--
-- 1) Adds missions.max_submissions_per_table (nullable: null = unlimited, 1 = one shot, N = cap).
-- 2) Backfills from allow_multiple_submissions for backward compatibility.
-- 3) Extends validation_type and submission_type checks to include 'text'.

-- ----- missions.max_submissions_per_table -----
alter table public.missions
  add column if not exists max_submissions_per_table int null;

comment on column public.missions.max_submissions_per_table is
  'Max pending+approved submissions per table for this mission; null = unlimited; 1 = single; N = cap. Rejected rows do not count.';

-- Backfill: old "multiple" → unlimited; else → 1
update public.missions
set max_submissions_per_table = case
  when coalesce(allow_multiple_submissions, false) = true then null
  else 1
end
where max_submissions_per_table is null;

-- ----- validation_type: add text -----
alter table public.missions
  drop constraint if exists missions_validation_type_check;

alter table public.missions
  add constraint missions_validation_type_check
  check (validation_type in ('photo', 'video', 'signature', 'text'));

-- ----- mission_submissions.submission_type: add text -----
alter table public.mission_submissions
  drop constraint if exists mission_submissions_submission_type_check;

alter table public.mission_submissions
  add constraint mission_submissions_submission_type_check
  check (submission_type in ('photo', 'video', 'signature', 'text'));
