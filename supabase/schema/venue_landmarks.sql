-- Venue landmarks (bar, stage, toilets, etc.) for the guest seating map.
-- Run in Supabase Dashboard → SQL Editor.

create table if not exists public.venue_landmarks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  kind text not null default 'other',
  grid_x integer not null default 0,
  grid_y integer not null default 0,
  width_units integer not null default 2,
  height_units integer not null default 2,
  shape text not null default 'rectangle',
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Migrate legacy span column names when present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venue_landmarks' and column_name = 'grid_span_w'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venue_landmarks' and column_name = 'width_units'
  ) then
    alter table public.venue_landmarks rename column grid_span_w to width_units;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venue_landmarks' and column_name = 'grid_span_h'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venue_landmarks' and column_name = 'height_units'
  ) then
    alter table public.venue_landmarks rename column grid_span_h to height_units;
  end if;
end $$;

alter table public.venue_landmarks
  add column if not exists width_units integer not null default 2,
  add column if not exists height_units integer not null default 2,
  add column if not exists shape text not null default 'rectangle',
  add column if not exists color text,
  add column if not exists sort_order integer not null default 0;

create index if not exists venue_landmarks_sort_order on public.venue_landmarks (sort_order, label);

alter table public.venue_landmarks enable row level security;

drop policy if exists "Allow public read venue_landmarks" on public.venue_landmarks;
create policy "Allow public read venue_landmarks"
  on public.venue_landmarks for select using (true);

drop policy if exists "Allow anon insert venue_landmarks" on public.venue_landmarks;
create policy "Allow anon insert venue_landmarks"
  on public.venue_landmarks for insert with check (true);

drop policy if exists "Allow anon update venue_landmarks" on public.venue_landmarks;
create policy "Allow anon update venue_landmarks"
  on public.venue_landmarks for update using (true) with check (true);

drop policy if exists "Allow anon delete venue_landmarks" on public.venue_landmarks;
create policy "Allow anon delete venue_landmarks"
  on public.venue_landmarks for delete using (true);

-- Seed defaults matching the original hard-coded guest map (32×24 grid).
insert into public.venue_landmarks (label, kind, grid_x, grid_y, width_units, height_units, shape, color, sort_order)
select v.label, v.kind, v.grid_x, v.grid_y, v.width_units, v.height_units, v.shape, v.color, v.sort_order
from (
  values
    ('Lift Lobby', 'lifts', 0, 5, 2, 2, 'rectangle', '#f4f4f5', 0),
    ('Reception', 'other', 0, 16, 2, 2, 'rectangle', '#f4f4f5', 1),
    ('Kitchen', 'other', 5, 21, 3, 2, 'rectangle', '#e4e4e7', 2),
    ('Activity / screen', 'stage', 26, 6, 3, 2, 'rectangle', '#dbeafe', 3),
    ('Bar', 'bar', 22, 18, 3, 2, 'pill', '#fef3c7', 4)
) as v(label, kind, grid_x, grid_y, width_units, height_units, shape, color, sort_order)
where not exists (select 1 from public.venue_landmarks limit 1);
