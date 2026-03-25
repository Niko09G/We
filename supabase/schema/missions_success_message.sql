-- Optional copy shown in the guest mission overlay after a successful submission.
-- Run in Supabase Dashboard → SQL Editor.

alter table public.missions
  add column if not exists success_message text;

comment on column public.missions.success_message is 'Guest overlay body after submit; null = use app default copy.';
