-- Mission-generated greeting identity metadata.
-- Run manually in Supabase SQL Editor.

alter table public.greetings
  add column if not exists source_type text not null default 'upload',
  add column if not exists table_id uuid null references public.tables(id) on delete set null,
  add column if not exists table_name text null,
  add column if not exists table_color text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'greetings_source_type_check'
  ) then
    alter table public.greetings
      add constraint greetings_source_type_check
      check (source_type in ('upload', 'mission'));
  end if;
end $$;

comment on column public.greetings.source_type is 'upload = direct guest greeting form, mission = greeting generated from mission submission.';
comment on column public.greetings.table_id is 'When source_type=mission, table that submitted the mission.';
comment on column public.greetings.table_name is 'Snapshot of table name for mission-generated greeting.';
comment on column public.greetings.table_color is 'Snapshot of table color for mission-generated greeting.';
