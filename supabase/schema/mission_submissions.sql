-- Mission submissions: guest attempts (signature / photo / manual) for admin review.
-- One non-rejected submission per (table_id, mission_id); rejected allows resubmit.
--
-- If you have an older mission_submissions table (e.g. with image_url), drop it first:
--   DROP TABLE IF EXISTS public.mission_submissions CASCADE;
-- Then run this script.

create table if not exists public.mission_submissions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  status text not null default 'pending',
  submission_type text not null,
  submission_data jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint mission_submissions_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint mission_submissions_submission_type_check
    check (submission_type in ('signature', 'photo', 'manual'))
);

create index if not exists mission_submissions_table_id on public.mission_submissions(table_id);
create index if not exists mission_submissions_mission_id on public.mission_submissions(mission_id);

-- One pending or approved per (table_id, mission_id); rejected rows do not block a new submission.
create unique index if not exists mission_submissions_one_active_per_table_mission
  on public.mission_submissions (table_id, mission_id)
  where (status in ('pending', 'approved'));

alter table public.mission_submissions enable row level security;

create policy "Allow anon insert mission_submissions"
  on public.mission_submissions for insert with check (true);

create policy "Allow anon read mission_submissions"
  on public.mission_submissions for select using (true);

-- Approve/reject from admin (MVP; lock down with auth later):
create policy "Allow anon update mission_submissions"
  on public.mission_submissions
  for update
  using (true)
  with check (true);
