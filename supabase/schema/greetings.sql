-- Greetings table for wedding greeting uploads
--
-- What to run in Supabase:
-- 1. In Dashboard → SQL Editor, paste and run this entire file.
-- 2. In Dashboard → Storage, ensure bucket "greetings" exists and is PUBLIC
--    (so getPublicUrl() works). If you create the bucket manually, set it to public.

create table if not exists public.greetings (
  id uuid primary key default gen_random_uuid(),
  name text,
  message text not null,
  image_url text not null,
  status text not null default 'ready',
  created_at timestamptz not null default now()
);

-- Optional: allow anonymous insert for MVP (no auth). Adjust RLS as needed later.
alter table public.greetings enable row level security;

create policy "Allow anonymous insert for greetings"
  on public.greetings
  for insert
  with check (true);

create policy "Allow public read for greetings"
  on public.greetings
  for select
  using (true);
