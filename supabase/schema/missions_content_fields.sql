-- Richer mission content: optional header and modal display.
-- Run in Supabase Dashboard → SQL Editor. Do not execute automatically.
--
-- target_person_name and submission_hint already exist (mission_submissions_storage.sql).
-- This adds header_title and header_image_url for the guest mission modal.

alter table public.missions
  add column if not exists header_title text,
  add column if not exists header_image_url text;

comment on column public.missions.header_title is 'Optional: display title in mission modal header (falls back to title).';
comment on column public.missions.header_image_url is 'Optional: image URL for mission modal header area.';
