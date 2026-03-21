-- Optional columns on attendees for future check-in / gift recording (no UI yet).
-- Run in Supabase SQL Editor after attendees table exists.
--
-- MVP choice: fields on `attendees` (not a separate table):
-- - One row per guest keeps seating + check-in + gifts in one place.
-- - `checked_in_at IS NULL` means not arrived; setting it marks checked-in with timestamp.
-- - `gift_amount_cents` stores monetary gift / ang pao in whole cents (nullable = unknown/not recorded).
--
-- Later: if you need audit history or multiple per guest, add a separate `attendee_check_in_events` table.

alter table public.attendees
  add column if not exists checked_in_at timestamptz null;

alter table public.attendees
  add column if not exists gift_amount_cents int null;

comment on column public.attendees.checked_in_at is
  'Null = not checked in; set when guest arrives (future check-in flow).';

comment on column public.attendees.gift_amount_cents is
  'Optional recorded gift / ang pao amount in cents (future admin or check-in UI).';
