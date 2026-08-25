-- Landmark label rotation + freeform architectural lines for the guest seating map.
-- Run in Supabase Dashboard → SQL Editor.

alter table public.venue_landmarks
  add column if not exists rotation integer not null default 0,
  add column if not exists is_line boolean not null default false;

comment on column public.venue_landmarks.rotation is 'Label rotation in degrees: 0, 90, 180, or 270.';
comment on column public.venue_landmarks.is_line is 'When true, width_units/height_units define the line end offset from grid_x/grid_y (not a filled block).';
