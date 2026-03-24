-- Event-wide reward unit (currency) for the game layer — single config, not per token/mission.
-- Run in Supabase SQL Editor after app_settings.sql.

insert into public.app_settings (key, value)
values (
  'reward_unit',
  jsonb_build_object(
    'name', 'BeatCoin',
    'short_label', null,
    'icon_main_url', null,
    'icon_alt_urls', '[]'::jsonb
  )
)
on conflict (key) do nothing;

comment on column public.app_settings.value is
  'JSONB payload per key; reward_unit: { name, short_label?, icon_main_url?, icon_alt_urls? }';
