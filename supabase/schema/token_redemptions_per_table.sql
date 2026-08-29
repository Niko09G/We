-- Beatcoin tokens: one redemption per (token, table) instead of global single-use.
-- Run in Supabase SQL Editor after beatcoin_tokens.sql.

-- ----- Per-table redemption ledger -----
create table if not exists public.token_redemptions (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.beatcoin_tokens (id) on delete cascade,
  table_id uuid not null references public.tables (id) on delete cascade,
  mission_submission_id uuid references public.mission_submissions (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  constraint token_redemptions_token_table_unique unique (token_id, table_id)
);

create index if not exists token_redemptions_token_id_idx on public.token_redemptions (token_id);
create index if not exists token_redemptions_table_id_idx on public.token_redemptions (table_id);

comment on table public.token_redemptions is 'One Beatcoin claim per physical token per table.';

alter table public.token_redemptions enable row level security;

-- Backfill from legacy single-claim columns (safe to re-run).
insert into public.token_redemptions (token_id, table_id, redeemed_at)
select bt.id, bt.claimed_by_table_id, bt.claimed_at
from public.beatcoin_tokens bt
where bt.claimed_at is not null
  and bt.claimed_by_table_id is not null
on conflict (token_id, table_id) do nothing;

-- ----- Peek (claim UI): points + per-table availability -----
drop function if exists public.peek_beatcoin (text);

create or replace function public.peek_beatcoin (p_token text, p_table_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.beatcoin_tokens%rowtype;
  v_already boolean := false;
begin
  select * into v_row from public.beatcoin_tokens where token = trim(p_token) limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if p_table_id is not null then
    select exists (
      select 1
      from public.token_redemptions tr
      where tr.token_id = v_row.id
        and tr.table_id = p_table_id
    )
    into v_already;
  end if;

  return jsonb_build_object(
    'ok', true,
    'points', v_row.points,
    'mission_id', v_row.mission_id,
    'already_claimed', v_already
  );
end;
$$;

-- ----- Atomic claim (one redemption per table) -----
create or replace function public.claim_beatcoin (p_token text, p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.beatcoin_tokens%rowtype;
  v_missions_enabled boolean;
  v_mission record;
  v_sub_id uuid;
  t_archived boolean;
  t_active boolean;
  v_ms jsonb;
begin
  select value into v_ms from public.app_settings where key = 'missions_enabled' limit 1;
  if not found or v_ms is null then
    v_missions_enabled := true;
  else
    v_missions_enabled := not (v_ms = 'false'::jsonb);
  end if;

  if v_missions_enabled is not true then
    return jsonb_build_object('ok', false, 'error', 'missions_disabled');
  end if;

  select * into v_row
  from public.beatcoin_tokens
  where token = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if exists (
    select 1
    from public.token_redemptions tr
    where tr.token_id = v_row.id
      and tr.table_id = p_table_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_claimed_by_table');
  end if;

  select * into v_mission from public.missions where id = v_row.mission_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'mission_not_found');
  end if;

  if coalesce(v_mission.validation_type, '') <> 'beatcoin' then
    return jsonb_build_object('ok', false, 'error', 'invalid_mission');
  end if;

  select is_archived, coalesce(is_active, true)
  into t_archived, t_active
  from public.tables
  where id = p_table_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'table_not_found');
  end if;

  if coalesce(t_archived, false) = true then
    return jsonb_build_object('ok', false, 'error', 'table_archived');
  end if;

  if coalesce(t_active, true) is not true then
    return jsonb_build_object('ok', false, 'error', 'table_inactive');
  end if;

  if not exists (
    select 1
    from public.mission_assignments ma
    where ma.table_id = p_table_id
      and ma.mission_id = v_row.mission_id
      and ma.is_active = true
  ) then
    return jsonb_build_object('ok', false, 'error', 'mission_not_assigned');
  end if;

  insert into public.mission_submissions (
    table_id,
    mission_id,
    status,
    submission_type,
    submission_data,
    approved_at
  )
  values (
    p_table_id,
    v_row.mission_id,
    'approved',
    'beatcoin',
    jsonb_build_object(
      'beatcoin_token_id', v_row.id,
      'points_awarded', v_row.points
    ),
    now()
  )
  returning id into v_sub_id;

  insert into public.token_redemptions (token_id, table_id, mission_submission_id)
  values (v_row.id, p_table_id, v_sub_id);

  return jsonb_build_object(
    'ok', true,
    'points', v_row.points,
    'mission_submission_id', v_sub_id
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_claimed_by_table');
end;
$$;

-- ----- Admin reset: clear all redemptions for a token -----
create or replace function public.reset_beatcoin_token(p_token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token record;
  v_sub_ids uuid[];
  v_deleted int := 0;
  v_redemption_count int := 0;
begin
  select id, mission_id
  into v_token
  from public.beatcoin_tokens
  where id = p_token_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'token_not_found');
  end if;

  select count(*)::int
  into v_redemption_count
  from public.token_redemptions tr
  where tr.token_id = p_token_id;

  if v_redemption_count = 0 then
    select case when claimed_at is not null then 1 else 0 end
    into v_redemption_count
    from public.beatcoin_tokens
    where id = p_token_id;
  end if;

  select array_agg(ms.id)
  into v_sub_ids
  from public.mission_submissions ms
  where ms.submission_type = 'beatcoin'
    and ms.mission_id = v_token.mission_id
    and ms.submission_data @> jsonb_build_object('beatcoin_token_id', p_token_id::text);

  if v_sub_ids is not null and array_length(v_sub_ids, 1) > 0 then
    delete from public.mission_submissions
    where id = any(v_sub_ids);
    get diagnostics v_deleted = row_count;
  end if;

  delete from public.token_redemptions
  where token_id = p_token_id;

  update public.beatcoin_tokens
  set claimed_by_table_id = null,
      claimed_at = null
  where id = p_token_id;

  return jsonb_build_object(
    'ok', true,
    'already_available', v_redemption_count = 0,
    'deleted_submissions', v_deleted
  );
end;
$$;

grant execute on function public.peek_beatcoin (text, uuid) to anon, authenticated;
grant execute on function public.claim_beatcoin (text, uuid) to anon, authenticated;
grant execute on function public.reset_beatcoin_token(uuid) to anon, authenticated;
