-- Extend reward_unit JSON shape with main + alternate icon URLs.
-- Keeps backward compatibility if old payload used `icon_url`.

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
on conflict (key) do update
set value = jsonb_build_object(
  'name', coalesce(nullif(app_settings.value->>'name', ''), 'BeatCoin'),
  'short_label', nullif(app_settings.value->>'short_label', ''),
  'icon_main_url',
    coalesce(
      nullif(app_settings.value->>'icon_main_url', ''),
      nullif(app_settings.value->>'icon_url', '')
    ),
  'icon_alt_urls',
    case
      when jsonb_typeof(app_settings.value->'icon_alt_urls') = 'array' then app_settings.value->'icon_alt_urls'
      else '[]'::jsonb
    end
)
where app_settings.key = 'reward_unit';
