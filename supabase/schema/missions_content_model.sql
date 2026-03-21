-- Mission content model: validation_type (photo|video|signature), approval_mode, greetings/repeatable
-- Run in Supabase Dashboard → SQL Editor.

alter table public.missions
  add column if not exists add_to_greetings boolean not null default false,
  add column if not exists allow_multiple_submissions boolean not null default false,
  add column if not exists points_per_submission int null;

comment on column public.missions.add_to_greetings is 'When true, approved photo submissions may be added to greetings carousel.';
comment on column public.missions.allow_multiple_submissions is 'When true, guests may submit multiple times; each approval can award points_per_submission.';
comment on column public.missions.points_per_submission is 'Points awarded per approved submission when allow_multiple_submissions is true; null means use missions.points once per mission.';

-- Migrate existing mission validation types before re-adding the check
update public.missions
set validation_type = 'photo'
where validation_type = 'manual';

alter table public.missions
  drop constraint if exists missions_validation_type_check;

alter table public.missions
  add constraint missions_validation_type_check
  check (validation_type in ('photo', 'video', 'signature'));

-- Migrate existing submission types before re-adding the check
update public.mission_submissions
set submission_type = 'signature'
where submission_type = 'manual';

alter table public.mission_submissions
  drop constraint if exists mission_submissions_submission_type_check;

alter table public.mission_submissions
  add constraint mission_submissions_submission_type_check
  check (submission_type in ('photo', 'video', 'signature'));