-- Attendees (guest list): CSV import, RSVP, optional table/seat, photos, invitation groups.
-- Run after public.tables exists (see leaderboard.sql).
--
-- 1) Paste into Supabase → SQL Editor and run.
-- 2) Run attendees_storage.sql for photo uploads (bucket + storage policies).
--
-- Upgrading an older DB that already has attendees but no groups: run
-- attendee_groups.sql (adds group table + columns idempotently).

create table if not exists public.attendee_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.attendee_groups is
  'Manual invitation/household/couple grouping; seating can be planned by group then seat.';

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

create table if not exists public.attendees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  rsvp_status text,
  table_id uuid null references public.tables (id) on delete set null,
  seat_number int null,
  group_id uuid null references public.attendee_groups (id) on delete set null,
  is_placeholder boolean not null default false,
  -- Relationship within the party for stable title + ordering.
  -- Used by admin UI: lead adult -> spouse -> children -> generic guests/placeholders.
  party_role text,
  is_archived boolean not null default false,
  archived_at timestamptz null,
  photo_url text,
  checked_in_at timestamptz null,
  gift_amount_cents int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.attendees is 'Guest roster; merge imports by email then by full_name (case-insensitive). Rows missing from CSV are never deleted. CSV does not set group_id / is_placeholder.';
comment on column public.attendees.is_placeholder is 'TBD guest (e.g. "Guest") until renamed in admin.';
comment on column public.attendees.is_archived is 'Soft-deleted guests: hidden from normal views; retained for safety/recovery.';
comment on column public.attendees.archived_at is 'Timestamp when the attendee was archived (soft-deleted).';
comment on column public.attendees.checked_in_at is
  'Null = not checked in; set on arrival (future check-in).';
comment on column public.attendees.gift_amount_cents is
  'Optional ang pao / gift in cents (future recording).';

create unique index if not exists attendees_email_lower_unique
  on public.attendees (lower(trim(email)))
  where email is not null
    and trim(email) <> ''
    and is_archived = false;

create index if not exists attendees_full_name_lower_idx
  on public.attendees (lower(trim(full_name)));

create index if not exists attendees_table_id_idx
  on public.attendees (table_id)
  where table_id is not null;

create index if not exists attendees_rsvp_status_idx
  on public.attendees (rsvp_status)
  where rsvp_status is not null;

create index if not exists attendees_group_id_idx
  on public.attendees (group_id)
  where group_id is not null;

-- Keep updated_at in sync on row updates
create or replace function public.attendees_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists attendees_touch_updated_at on public.attendees;
create trigger attendees_touch_updated_at
  before update on public.attendees
  for each row
  execute function public.attendees_touch_updated_at();

alter table public.attendees enable row level security;

-- MVP: same pattern as tables — replace with auth later
create policy "Allow public read attendees"
  on public.attendees for select
  using (true);

create policy "Allow anon insert attendees"
  on public.attendees for insert
  with check (true);

create policy "Allow anon update attendees"
  on public.attendees for update
  using (true)
  with check (true);
