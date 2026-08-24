-- Physical tables can share one logical team (scoring, lobby, seat-map styling).
-- Run in Supabase SQL Editor after public.tables and public.teams exist.
--
-- Model:
--   public.teams          = parent team identity (name used on leaderboard)
--   public.tables.team_id = FK to that team
-- Existing tables are backfilled as 1:1 teams (team_id = table id).
-- Optional second script: supabase/schema/tables_red_team_blocks.sql

alter table public.tables
  add column if not exists team_id uuid;

-- One team per existing physical table, reusing the table UUID so leaderboard
-- keys stay stable (team_id === original table id).
insert into public.teams (id, name, created_at)
select t.id, t.name, coalesce(t.created_at, now())
from public.tables t
where not exists (select 1 from public.teams tt where tt.id = t.id)
  and not exists (select 1 from public.teams tt where tt.name = t.name);

update public.tables t
set team_id = tt.id
from public.teams tt
where t.team_id is null
  and tt.name = t.name;

update public.tables t
set team_id = t.id
where t.team_id is null
  and exists (select 1 from public.teams tt where tt.id = t.id);

do $fk$
begin
  alter table public.tables
    add constraint tables_team_id_fkey
    foreign key (team_id) references public.teams(id) on delete set null;
exception
  when duplicate_object then null;
end
$fk$;

create index if not exists tables_team_id_idx on public.tables (team_id);

-- Client-side team creation (admin tables UI) — complements teams_snaps.sql policies.
drop policy if exists "Allow public read teams" on public.teams;
create policy "Allow public read teams"
  on public.teams for select using (true);

drop policy if exists "Allow anon insert teams" on public.teams;
create policy "Allow anon insert teams"
  on public.teams for insert with check (true);

drop policy if exists "Allow anon update teams" on public.teams;
create policy "Allow anon update teams"
  on public.teams for update using (true) with check (true);

comment on column public.tables.team_id is
  'Parent logical team. Sibling physical blocks (e.g. Red Block A/B) share this id.';
