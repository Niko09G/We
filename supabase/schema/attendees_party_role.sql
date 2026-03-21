-- Add party_role to attendees for stable party ownership/title and member ordering.
-- Run in Supabase SQL editor to upgrade existing databases.

alter table public.attendees
  add column if not exists party_role text null;

comment on column public.attendees.party_role is
  'Relationship within invitation party for stable admin UX ordering/title (lead_adult, spouse, child, guest, placeholder).';

