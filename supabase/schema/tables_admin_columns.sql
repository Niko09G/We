-- Table/team management: optional color, is_active, created_at. Run in Supabase SQL Editor.
-- Enforces unique table names. Adds anon insert/update for admin MVP.

alter table public.tables
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists color text,
  add column if not exists is_active boolean not null default true;

-- Prevent duplicate table names (case-sensitive)
create unique index if not exists tables_name_key on public.tables (name);

-- Allow admin to create and update tables (MVP; replace with auth later)
create policy "Allow anon insert tables"
  on public.tables for insert with check (true);

create policy "Allow anon update tables"
  on public.tables for update using (true) with check (true);
