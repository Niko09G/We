-- Mission assignment mapping: which missions apply to which tables.
-- Run in Supabase Dashboard → SQL Editor.

create table if not exists public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint mission_assignments_active_check
    check (is_active in (true, false))
);

-- One assignment row per (mission_id, table_id).
create unique index if not exists mission_assignments_unique_mission_table
  on public.mission_assignments (mission_id, table_id);

create index if not exists mission_assignments_table_id
  on public.mission_assignments(table_id);
create index if not exists mission_assignments_mission_id
  on public.mission_assignments(mission_id);

alter table public.mission_assignments enable row level security;

-- Guests need to read assignments to render mission quests.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mission_assignments'
      and policyname = 'Allow public read mission_assignments'
  ) then
    create policy "Allow public read mission_assignments"
      on public.mission_assignments
      for select
      using (true);
  end if;

  -- Admin MVP uses anon insert/update until auth is added.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mission_assignments'
      and policyname = 'Allow anon insert mission_assignments'
  ) then
    create policy "Allow anon insert mission_assignments"
      on public.mission_assignments
      for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mission_assignments'
      and policyname = 'Allow anon update mission_assignments'
  ) then
    create policy "Allow anon update mission_assignments"
      on public.mission_assignments
      for update
      using (true)
      with check (true);
  end if;
end $$;

