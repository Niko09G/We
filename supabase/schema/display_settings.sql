-- Live display overlay remote control (leaderboard / speech / announcement).
-- Run in Supabase Dashboard → SQL Editor after app_settings.sql.
-- Enable Realtime for this table: Database → Replication → supabase_realtime → display_settings.

create table if not exists public.display_settings (
  key text primary key,
  value jsonb not null
);

alter table public.display_settings enable row level security;

create policy "Allow public read display_settings"
  on public.display_settings
  for select
  using (true);

create policy "Allow anon insert display_settings"
  on public.display_settings
  for insert
  with check (true);

create policy "Allow anon update display_settings"
  on public.display_settings
  for update
  using (true)
  with check (true);

insert into public.display_settings (key, value)
values
  ('active_overlay', to_jsonb('leaderboard'::text)),
  ('announcement_text', to_jsonb(''::text))
on conflict (key) do nothing;
