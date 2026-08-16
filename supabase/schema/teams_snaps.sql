-- Snaps bar host: teams with direct score + activity log for undo.
-- Run in Supabase SQL Editor.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#71717a',
  badge_emoji text,
  score integer not null default 0 check (score >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.snaps_activity (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  points integer not null default 5 check (points > 0),
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists snaps_activity_team_id_idx on public.snaps_activity(team_id);
create index if not exists snaps_activity_created_at_idx on public.snaps_activity(created_at desc);

alter table public.teams enable row level security;
alter table public.snaps_activity enable row level security;

create policy "Allow anon read active teams"
  on public.teams for select
  using (is_active = true);

create policy "Allow anon read snaps activity"
  on public.snaps_activity for select
  using (true);

-- Writes go through server API (service role) after PIN auth.

insert into public.teams (name, color, badge_emoji, sort_order)
values
  ('Karang Gunis', '#ef4444', '🦀', 1),
  ('Durian Sellers', '#f59e0b', '🍈', 2),
  ('Kaypoh Aunties', '#3b82f6', '👀', 3),
  ('Taxi Uncles', '#22c55e', '🚕', 4)
on conflict (name) do nothing;
