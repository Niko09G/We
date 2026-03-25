-- Guest card theme + optional full-bleed cover (admin mission builder).
-- Run in Supabase Dashboard → SQL Editor.

alter table public.missions
  add column if not exists card_theme_index smallint;

alter table public.missions
  drop constraint if exists missions_card_theme_index_range;

alter table public.missions
  add constraint missions_card_theme_index_range
  check (
    card_theme_index is null
    or (card_theme_index >= 0 and card_theme_index < 6)
  );

alter table public.missions
  add column if not exists card_cover_image_url text;

comment on column public.missions.card_theme_index is '0–5 maps to MISSION_CARD_BACKGROUNDS; null = legacy list-based gradient.';
comment on column public.missions.card_cover_image_url is 'Optional card background image; null = gradient / theme only.';
