-- Reversible reset/archive layer for event operations.
-- Run manually in Supabase SQL Editor.

create table if not exists public.reset_batches (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  note text,
  actor text,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by text
);

create table if not exists public.reset_archive_mission_submissions (
  batch_id uuid not null references public.reset_batches(id) on delete cascade,
  submission_id uuid not null,
  row_data jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (batch_id, submission_id)
);

create table if not exists public.reset_archive_completions (
  batch_id uuid not null references public.reset_batches(id) on delete cascade,
  completion_id uuid not null,
  row_data jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (batch_id, completion_id)
);

create table if not exists public.reset_archive_greetings (
  batch_id uuid not null references public.reset_batches(id) on delete cascade,
  greeting_id uuid not null,
  row_data jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (batch_id, greeting_id)
);

create table if not exists public.reset_archive_token_claims (
  batch_id uuid not null references public.reset_batches(id) on delete cascade,
  token_id uuid not null,
  row_data jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (batch_id, token_id)
);

alter table public.reset_batches enable row level security;
alter table public.reset_archive_mission_submissions enable row level security;
alter table public.reset_archive_completions enable row level security;
alter table public.reset_archive_greetings enable row level security;
alter table public.reset_archive_token_claims enable row level security;

drop policy if exists "Allow public read reset_batches" on public.reset_batches;
create policy "Allow public read reset_batches"
  on public.reset_batches for select using (true);

drop policy if exists "Allow anon insert reset_batches" on public.reset_batches;
create policy "Allow anon insert reset_batches"
  on public.reset_batches for insert with check (true);

drop policy if exists "Allow anon update reset_batches" on public.reset_batches;
create policy "Allow anon update reset_batches"
  on public.reset_batches for update using (true) with check (true);

drop policy if exists "Allow public read reset_archive_mission_submissions" on public.reset_archive_mission_submissions;
create policy "Allow public read reset_archive_mission_submissions"
  on public.reset_archive_mission_submissions for select using (true);
drop policy if exists "Allow anon insert reset_archive_mission_submissions" on public.reset_archive_mission_submissions;
create policy "Allow anon insert reset_archive_mission_submissions"
  on public.reset_archive_mission_submissions for insert with check (true);

drop policy if exists "Allow public read reset_archive_completions" on public.reset_archive_completions;
create policy "Allow public read reset_archive_completions"
  on public.reset_archive_completions for select using (true);
drop policy if exists "Allow anon insert reset_archive_completions" on public.reset_archive_completions;
create policy "Allow anon insert reset_archive_completions"
  on public.reset_archive_completions for insert with check (true);

drop policy if exists "Allow public read reset_archive_greetings" on public.reset_archive_greetings;
create policy "Allow public read reset_archive_greetings"
  on public.reset_archive_greetings for select using (true);
drop policy if exists "Allow anon insert reset_archive_greetings" on public.reset_archive_greetings;
create policy "Allow anon insert reset_archive_greetings"
  on public.reset_archive_greetings for insert with check (true);

drop policy if exists "Allow public read reset_archive_token_claims" on public.reset_archive_token_claims;
create policy "Allow public read reset_archive_token_claims"
  on public.reset_archive_token_claims for select using (true);
drop policy if exists "Allow anon insert reset_archive_token_claims" on public.reset_archive_token_claims;
create policy "Allow anon insert reset_archive_token_claims"
  on public.reset_archive_token_claims for insert with check (true);

create or replace function public.admin_reset_with_archive(
  p_scope text,
  p_table_id uuid default null,
  p_mission_id uuid default null,
  p_submission_id uuid default null,
  p_token_id uuid default null,
  p_greeting_id uuid default null,
  p_note text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := btrim(coalesce(p_scope, ''));
  v_batch_id uuid;
  v_sub_count int := 0;
  v_comp_count int := 0;
  v_greet_count int := 0;
  v_token_count int := 0;
begin
  if v_scope = '' then
    return jsonb_build_object('ok', false, 'error', 'scope_required');
  end if;

  insert into public.reset_batches (scope, note, actor)
  values (v_scope, nullif(btrim(coalesce(p_note, '')), ''), nullif(btrim(coalesce(p_actor, '')), ''))
  returning id into v_batch_id;

  create temp table _target_pairs (table_id uuid, mission_id uuid) on commit drop;
  create temp table _target_submissions (id uuid primary key, table_id uuid, mission_id uuid) on commit drop;
  create temp table _target_completions (id uuid primary key) on commit drop;
  create temp table _target_greetings (id uuid primary key) on commit drop;
  create temp table _target_tokens (id uuid primary key) on commit drop;

  if v_scope = 'single_submission' then
    insert into _target_submissions (id, table_id, mission_id)
    select id, table_id, mission_id
    from public.mission_submissions
    where id = p_submission_id;

  elsif v_scope = 'single_token' then
    if p_token_id is not null then
      insert into _target_tokens (id) values (p_token_id) on conflict do nothing;
    end if;
    insert into _target_submissions (id, table_id, mission_id)
    select ms.id, ms.table_id, ms.mission_id
    from public.mission_submissions ms
    where ms.submission_type = 'beatcoin'
      and ms.submission_data @> jsonb_build_object('beatcoin_token_id', p_token_id::text);

  elsif v_scope = 'single_greeting' then
    insert into _target_greetings (id)
    select g.id from public.greetings g where g.id = p_greeting_id;

  elsif v_scope = 'mission_for_team' then
    insert into _target_submissions (id, table_id, mission_id)
    select id, table_id, mission_id
    from public.mission_submissions
    where mission_id = p_mission_id
      and table_id = p_table_id;

  elsif v_scope = 'mission_all_teams' then
    insert into _target_submissions (id, table_id, mission_id)
    select id, table_id, mission_id
    from public.mission_submissions
    where mission_id = p_mission_id;

  elsif v_scope = 'table_all_progress' then
    insert into _target_submissions (id, table_id, mission_id)
    select id, table_id, mission_id
    from public.mission_submissions
    where table_id = p_table_id;

  elsif v_scope = 'event_all_progress' then
    insert into _target_submissions (id, table_id, mission_id)
    select id, table_id, mission_id
    from public.mission_submissions;

  elsif v_scope = 'content_feed' then
    insert into _target_greetings (id)
    select id from public.greetings;

  elsif v_scope = 'table_token_claims' then
    insert into _target_tokens (id)
    select bt.id
    from public.beatcoin_tokens bt
    where bt.claimed_by_table_id = p_table_id
      and bt.claimed_at is not null;

    insert into _target_submissions (id, table_id, mission_id)
    select ms.id, ms.table_id, ms.mission_id
    from public.mission_submissions ms
    where ms.table_id = p_table_id
      and ms.submission_type = 'beatcoin';

  elsif v_scope = 'event_token_claims' then
    insert into _target_tokens (id)
    select bt.id
    from public.beatcoin_tokens bt
    where bt.claimed_at is not null;

    insert into _target_submissions (id, table_id, mission_id)
    select ms.id, ms.table_id, ms.mission_id
    from public.mission_submissions ms
    where ms.submission_type = 'beatcoin';

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_scope');
  end if;

  insert into _target_pairs (table_id, mission_id)
  select distinct s.table_id, s.mission_id from _target_submissions s
  where s.table_id is not null and s.mission_id is not null;

  -- Completions tied to target table+mission pairs.
  insert into _target_completions (id)
  select c.id
  from public.completions c
  join _target_pairs p
    on p.table_id = c.table_id and p.mission_id = c.mission_id
  on conflict do nothing;

  -- Greetings tied to target submissions.
  insert into _target_greetings (id)
  select g.id
  from public.greetings g
  join _target_submissions s on s.id = g.mission_submission_id
  on conflict do nothing;

  -- Tokens tied to beatcoin submissions.
  insert into _target_tokens (id)
  select (ms.submission_data->>'beatcoin_token_id')::uuid
  from _target_submissions ts
  join public.mission_submissions ms on ms.id = ts.id
  where ms.submission_type = 'beatcoin'
    and coalesce(ms.submission_data->>'beatcoin_token_id', '') <> ''
  on conflict do nothing;

  -- Archive then delete mission submissions.
  insert into public.reset_archive_mission_submissions (batch_id, submission_id, row_data)
  select v_batch_id, ms.id, to_jsonb(ms)
  from public.mission_submissions ms
  join _target_submissions t on t.id = ms.id
  on conflict do nothing;

  delete from public.mission_submissions ms
  using _target_submissions t
  where ms.id = t.id;
  get diagnostics v_sub_count = row_count;

  -- Archive then delete completions.
  insert into public.reset_archive_completions (batch_id, completion_id, row_data)
  select v_batch_id, c.id, to_jsonb(c)
  from public.completions c
  join _target_completions t on t.id = c.id
  on conflict do nothing;

  delete from public.completions c
  using _target_completions t
  where c.id = t.id;
  get diagnostics v_comp_count = row_count;

  -- Archive then delete greetings.
  insert into public.reset_archive_greetings (batch_id, greeting_id, row_data)
  select v_batch_id, g.id, to_jsonb(g)
  from public.greetings g
  join _target_greetings t on t.id = g.id
  on conflict do nothing;

  delete from public.greetings g
  using _target_greetings t
  where g.id = t.id;
  get diagnostics v_greet_count = row_count;

  -- Archive token claim state then unclaim.
  insert into public.reset_archive_token_claims (batch_id, token_id, row_data)
  select v_batch_id, bt.id, to_jsonb(bt)
  from public.beatcoin_tokens bt
  join _target_tokens t on t.id = bt.id
  where bt.claimed_at is not null
  on conflict do nothing;

  update public.beatcoin_tokens bt
  set claimed_by_table_id = null,
      claimed_at = null
  from _target_tokens t
  where bt.id = t.id
    and bt.claimed_at is not null;
  get diagnostics v_token_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'scope', v_scope,
    'archived_submissions', v_sub_count,
    'archived_completions', v_comp_count,
    'archived_greetings', v_greet_count,
    'reset_token_claims', v_token_count
  );
end;
$$;

create or replace function public.admin_restore_reset_batch(
  p_batch_id uuid,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch record;
  v_sub int := 0;
  v_comp int := 0;
  v_greet int := 0;
  v_tok int := 0;
begin
  select * into v_batch
  from public.reset_batches
  where id = p_batch_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'batch_not_found');
  end if;
  if v_batch.restored_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_restored');
  end if;

  -- Restore mission submissions first.
  insert into public.mission_submissions (
    id, table_id, mission_id, status, submission_type, submission_data, created_at, review_note, approved_at, client_request_id
  )
  select
    (a.row_data->>'id')::uuid,
    (a.row_data->>'table_id')::uuid,
    (a.row_data->>'mission_id')::uuid,
    (a.row_data->>'status')::text,
    (a.row_data->>'submission_type')::text,
    (a.row_data->'submission_data')::jsonb,
    coalesce((a.row_data->>'created_at')::timestamptz, now()),
    nullif(a.row_data->>'review_note', ''),
    case when a.row_data ? 'approved_at' and (a.row_data->>'approved_at') <> '' then (a.row_data->>'approved_at')::timestamptz else null end,
    nullif(a.row_data->>'client_request_id', '')
  from public.reset_archive_mission_submissions a
  where a.batch_id = p_batch_id
  on conflict (id) do nothing;
  get diagnostics v_sub = row_count;

  -- Restore completions.
  insert into public.completions (id, table_id, mission_id, created_at)
  select
    (a.row_data->>'id')::uuid,
    (a.row_data->>'table_id')::uuid,
    (a.row_data->>'mission_id')::uuid,
    coalesce((a.row_data->>'created_at')::timestamptz, now())
  from public.reset_archive_completions a
  where a.batch_id = p_batch_id
  on conflict (id) do nothing;
  get diagnostics v_comp = row_count;

  -- Restore greetings.
  insert into public.greetings (
    id, name, message, image_url, status, created_at, source_type, table_id, table_name, table_color, mission_submission_id
  )
  select
    (a.row_data->>'id')::uuid,
    nullif(a.row_data->>'name', ''),
    coalesce(a.row_data->>'message', ''),
    coalesce(a.row_data->>'image_url', ''),
    coalesce(a.row_data->>'status', 'ready'),
    coalesce((a.row_data->>'created_at')::timestamptz, now()),
    nullif(a.row_data->>'source_type', ''),
    case when a.row_data ? 'table_id' and (a.row_data->>'table_id') <> '' then (a.row_data->>'table_id')::uuid else null end,
    nullif(a.row_data->>'table_name', ''),
    nullif(a.row_data->>'table_color', ''),
    case when a.row_data ? 'mission_submission_id' and (a.row_data->>'mission_submission_id') <> '' then (a.row_data->>'mission_submission_id')::uuid else null end
  from public.reset_archive_greetings a
  where a.batch_id = p_batch_id
  on conflict (id) do nothing;
  get diagnostics v_greet = row_count;

  -- Restore token claim state.
  update public.beatcoin_tokens bt
  set claimed_by_table_id = case when a.row_data ? 'claimed_by_table_id' and (a.row_data->>'claimed_by_table_id') <> '' then (a.row_data->>'claimed_by_table_id')::uuid else null end,
      claimed_at = case when a.row_data ? 'claimed_at' and (a.row_data->>'claimed_at') <> '' then (a.row_data->>'claimed_at')::timestamptz else null end
  from public.reset_archive_token_claims a
  where a.batch_id = p_batch_id
    and bt.id = a.token_id;
  get diagnostics v_tok = row_count;

  update public.reset_batches
  set restored_at = now(),
      restored_by = nullif(btrim(coalesce(p_actor, '')), '')
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'restored_submissions', v_sub,
    'restored_completions', v_comp,
    'restored_greetings', v_greet,
    'restored_token_claims', v_tok
  );
end;
$$;

grant execute on function public.admin_reset_with_archive(text, uuid, uuid, uuid, uuid, uuid, text, text)
  to anon, authenticated;

grant execute on function public.admin_restore_reset_batch(uuid, text)
  to anon, authenticated;

