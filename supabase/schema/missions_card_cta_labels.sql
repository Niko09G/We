-- Guest mission carousel: configurable primary CTA copy on cards.
-- Run in Supabase Dashboard → SQL Editor.

alter table public.missions
  add column if not exists card_cta_label text;

alter table public.missions
  add column if not exists card_completed_label text;

comment on column public.missions.card_cta_label is 'Guest card button before complete; null = Start mission.';
comment on column public.missions.card_completed_label is 'Guest card button when complete; null = Completed.';
