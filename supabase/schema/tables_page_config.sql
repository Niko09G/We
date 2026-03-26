-- Per-team guest page config (hero, theme, typography). Safe defaults in app when null/invalid.
alter table public.tables
  add column if not exists page_config jsonb not null default '{}'::jsonb;

comment on column public.tables.page_config is 'Team page JSON: hero, theme, typography (see lib/team-page-config.ts).';
