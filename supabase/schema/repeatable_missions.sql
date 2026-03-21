-- Repeatable greeting-style missions:
-- - add missions.message_required
-- - allow multiple approved rows in mission_submissions
-- Run manually in Supabase SQL Editor.

alter table public.missions
  add column if not exists message_required boolean not null default false;

comment on column public.missions.message_required is 'When true, guest must include a message with submission.';

-- Old index blocks both pending and approved, which prevents repeatable auto-approved missions.
drop index if exists public.mission_submissions_one_active_per_table_mission;

-- Keep safety for pending manual-review flow: only one pending at a time.
create unique index if not exists mission_submissions_one_pending_per_table_mission
  on public.mission_submissions (table_id, mission_id)
  where (status = 'pending');
