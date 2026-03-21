-- Seating planner: max seats per physical table (1..N seat numbers per table).
-- Run in Supabase SQL Editor after public.tables exists.

alter table public.tables
  add column if not exists capacity int not null default 10;

comment on column public.tables.capacity is
  'Maximum seats for seating planner; seat_number is scoped per table (1..capacity).';

-- Enforce at least one seat (optional; app also validates).
do $c$
begin
  alter table public.tables
    add constraint tables_capacity_positive check (capacity >= 1);
exception
  when duplicate_object then null;
end
$c$;
