-- Soft-delete (archive) for wedding tables/teams.
-- Run in Supabase Dashboard → SQL Editor.

alter table public.tables
  add column if not exists is_archived boolean not null default false;

alter table public.tables
  add column if not exists archived_at timestamptz null;

comment on column public.tables.is_archived is 'When true, table is hidden from guests and scoreboard; related rows are kept.';
comment on column public.tables.archived_at is 'Timestamp when the table was archived; null when active.';

create index if not exists tables_is_archived_idx on public.tables (is_archived) where (is_archived = false);
