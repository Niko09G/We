-- Fix attendees_party_role_check constraint to match the app's canonical party_role values.
--
-- The admin app inserts:
--   lead_adult, spouse, child, guest, placeholder
--
-- If your DB already has attendees_party_role_check with a different allowed set,
-- this migration updates it so inserts won't fail.

alter table public.attendees
  drop constraint if exists attendees_party_role_check;

alter table public.attendees
  add constraint attendees_party_role_check
  check (
    party_role is null
    or party_role in ('lead_adult', 'lead', 'spouse', 'child', 'guest', 'placeholder')
  );

