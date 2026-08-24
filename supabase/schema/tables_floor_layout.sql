-- Floor plan grid placement for guest seating map and admin layout builder.
-- Run in Supabase Dashboard → SQL Editor.

alter table public.tables
  add column if not exists grid_x integer,
  add column if not exists grid_y integer;

-- Migrate legacy span column names when present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tables' and column_name = 'grid_span_w'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tables' and column_name = 'width_units'
  ) then
    alter table public.tables rename column grid_span_w to width_units;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tables' and column_name = 'grid_span_h'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tables' and column_name = 'height_units'
  ) then
    alter table public.tables rename column grid_span_h to height_units;
  end if;
end $$;

alter table public.tables
  add column if not exists width_units integer not null default 5,
  add column if not exists height_units integer not null default 3,
  add column if not exists shape text,
  add column if not exists color text;

comment on column public.tables.grid_x is 'Top-left grid column (0-based) on venue floor plan.';
comment on column public.tables.grid_y is 'Top-left grid row (0-based) on venue floor plan.';
comment on column public.tables.width_units is 'Table width in grid cells.';
comment on column public.tables.height_units is 'Table height in grid cells.';
comment on column public.tables.shape is 'Optional table card shape override.';
comment on column public.tables.color is 'Optional table accent color.';
