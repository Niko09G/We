-- Attendee invitation/household groups + columns on attendees.
-- Run this if you already applied an older attendees.sql without groups.
-- (Safe to re-run: IF NOT EXISTS / IF NOT EXISTS columns.)
--
-- Fresh install: you can rely on attendees.sql alone if it already includes
-- attendee_groups + group columns; otherwise run this after attendees.sql.

create table if not exists public.attendee_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.attendee_groups is
  'Manual invitation/household/couple grouping; use for seating prep without inferring from CSV.';

alter table public.attendees
  add column if not exists group_id uuid null references public.attendee_groups (id) on delete set null;

alter table public.attendees
  add column if not exists is_placeholder boolean not null default false;

comment on column public.attendees.group_id is 'Invitation group; null = not assigned to a group.';
comment on column public.attendees.is_placeholder is 'True for TBD guests (e.g. label "Guest") until renamed in admin.';

create index if not exists attendees_group_id_idx
  on public.attendees (group_id)
  where group_id is not null;

alter table public.attendee_groups enable row level security;

drop policy if exists "Allow public read attendee_groups" on public.attendee_groups;
create policy "Allow public read attendee_groups"
  on public.attendee_groups for select
  using (true);

drop policy if exists "Allow anon insert attendee_groups" on public.attendee_groups;
create policy "Allow anon insert attendee_groups"
  on public.attendee_groups for insert
  with check (true);

drop policy if exists "Allow anon update attendee_groups" on public.attendee_groups;
create policy "Allow anon update attendee_groups"
  on public.attendee_groups for update
  using (true)
  with check (true);

drop policy if exists "Allow anon delete attendee_groups" on public.attendee_groups;
create policy "Allow anon delete attendee_groups"
  on public.attendee_groups for delete
  using (true);
