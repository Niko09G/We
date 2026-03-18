-- Leaderboard: tables, missions, completions
-- Run in Supabase Dashboard → SQL Editor.

-- Tables (e.g. wedding tables)
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

-- Missions (global list; each has a point value)
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points int not null default 0
);

-- Completions: which table completed which mission (at most once per table per mission)
create table if not exists public.completions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(table_id, mission_id)
);

create index if not exists completions_table_id on public.completions(table_id);
create index if not exists completions_mission_id on public.completions(mission_id);

alter table public.tables enable row level security;
alter table public.missions enable row level security;
alter table public.completions enable row level security;

create policy "Allow public read tables" on public.tables for select using (true);
create policy "Allow public read missions" on public.missions for select using (true);
create policy "Allow public read completions" on public.completions for select using (true);
