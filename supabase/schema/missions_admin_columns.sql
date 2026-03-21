-- Mission management columns + admin MVP RLS
-- Run in Supabase Dashboard → SQL Editor.

alter table public.missions
  add column if not exists validation_type text not null default 'manual',
  add column if not exists is_active boolean not null default true,
  add column if not exists approval_mode text not null default 'auto';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'missions_validation_type_check'
  ) then
    alter table public.missions
      add constraint missions_validation_type_check
      check (validation_type in ('signature', 'photo', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'missions_approval_mode_check'
  ) then
    alter table public.missions
      add constraint missions_approval_mode_check
      check (approval_mode in ('auto', 'manual'));
  end if;
end $$;

-- Ensure RLS is enabled (leaderboard.sql enables it initially, but we re-assert here).
alter table public.missions enable row level security;

-- Allow anon insert/update for admin MVP (replace with auth later).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'missions'
      and policyname = 'Allow anon insert missions (MVP)'
  ) then
    create policy "Allow anon insert missions (MVP)"
      on public.missions for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'missions'
      and policyname = 'Allow anon update missions (MVP)'
  ) then
    create policy "Allow anon update missions (MVP)"
      on public.missions
      for update
      using (true)
      with check (true);
  end if;
end $$;
