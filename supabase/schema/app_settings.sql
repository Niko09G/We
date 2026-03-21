-- Global application settings (MVP).
-- Run in Supabase Dashboard → SQL Editor.

-- Stores boolean-ish values as JSONB for future flexibility.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null
);

alter table public.app_settings enable row level security;

-- Allow public read (guests need to know if missions are enabled).
create policy "Allow public read app_settings"
  on public.app_settings
  for select
  using (true);

-- Allow anon insert/update for admin MVP (no auth yet).
create policy "Allow anon insert app_settings"
  on public.app_settings
  for insert
  with check (true);

create policy "Allow anon update app_settings"
  on public.app_settings
  for update
  using (true)
  with check (true);

-- Default: missions are enabled unless admin toggles.
insert into public.app_settings (key, value)
values ('missions_enabled', to_jsonb(true))
on conflict (key) do nothing;

