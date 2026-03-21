-- Soft delete (archive) for attendees.
-- Run this in Supabase SQL Editor after you have `public.attendees` already created.

-- 1) Add archive columns
alter table public.attendees
  add column if not exists is_archived boolean not null default false;

alter table public.attendees
  add column if not exists archived_at timestamptz null;

-- 2) Helpful indexes
create index if not exists attendees_is_archived_idx
  on public.attendees (is_archived);

create index if not exists attendees_archived_at_idx
  on public.attendees (archived_at);

-- 3) Email uniqueness should apply only to active (non-archived) guests,
--    so that re-importing a previously archived guest doesn't error.
--    IMPORTANT: this prevents “deleted guests silently returning” by keeping
--    them archived and allowing new active rows with the same email.
drop index if exists public.attendees_email_lower_unique;

create unique index attendees_email_lower_unique
  on public.attendees (lower(trim(email)))
  where email is not null
    and trim(email) <> ''
    and is_archived = false;

-- 4) Prevent hard deletes via the existing RLS policy (archive instead).
drop policy if exists "Allow anon delete attendees" on public.attendees;

