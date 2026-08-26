-- Dietary restrictions and catering logistics flags on guest roster.
-- Run in Supabase → SQL Editor after attendees.sql.

alter table public.attendees
  add column if not exists dietary_restrictions text[] not null default '{}',
  add column if not exists needs_baby_chair boolean not null default false,
  add column if not exists needs_kids_menu boolean not null default false,
  add column if not exists no_meal boolean not null default false;

comment on column public.attendees.dietary_restrictions is
  'Multi-select dietary flags for catering (e.g. Gluten, Soy, Lactose).';
comment on column public.attendees.needs_baby_chair is
  'Guest requires a high chair at their table.';
comment on column public.attendees.needs_kids_menu is
  'Guest requires a kids menu meal.';
comment on column public.attendees.no_meal is
  'Guest does not receive a plated meal (e.g. infant).';
