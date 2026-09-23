-- Presenter slides for the live display screen.
-- Run in Supabase Dashboard → SQL Editor after display_settings.sql.
-- Enable Realtime: Database → Replication → supabase_realtime → display_slides.

create table if not exists public.display_slides (
  id uuid primary key default gen_random_uuid(),
  bg_color text not null default '#0f172a',
  eyebrow text not null default '',
  title text not null default '',
  speakers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.display_slides enable row level security;

create policy "Allow public read display_slides"
  on public.display_slides
  for select
  using (true);

create policy "Allow anon insert display_slides"
  on public.display_slides
  for insert
  with check (true);

create policy "Allow anon update display_slides"
  on public.display_slides
  for update
  using (true)
  with check (true);

create policy "Allow anon delete display_slides"
  on public.display_slides
  for delete
  using (true);

-- Presenter photo uploads (public bucket for getPublicUrl).
insert into storage.buckets (id, name, public)
values ('display-slides', 'display-slides', true)
on conflict (id) do update set public = true;

drop policy if exists "Allow anon insert display-slides" on storage.objects;
create policy "Allow anon insert display-slides"
  on storage.objects for insert
  with check (bucket_id = 'display-slides');

drop policy if exists "Allow public read display-slides" on storage.objects;
create policy "Allow public read display-slides"
  on storage.objects for select
  using (bucket_id = 'display-slides');

drop policy if exists "Allow anon delete display-slides" on storage.objects;
create policy "Allow anon delete display-slides"
  on storage.objects for delete
  using (bucket_id = 'display-slides');

-- Track which slide is live on the big screen.
insert into public.display_settings (key, value)
values ('active_slide_id', to_jsonb(''::text))
on conflict (key) do nothing;
