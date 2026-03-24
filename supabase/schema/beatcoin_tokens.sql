-- Beatcoins: physical QR tokens linked to a beatcoin mission; one claim per token.
-- Run in Supabase SQL Editor after missions_text_max_submissions.sql (validation_type includes text).

-- ----- Extend validation_type + submission_type -----
alter table public.missions
  drop constraint if exists missions_validation_type_check;

alter table public.missions
  add constraint missions_validation_type_check
  check (validation_type in ('photo', 'video', 'signature', 'text', 'beatcoin'));

alter table public.mission_submissions
  drop constraint if exists mission_submissions_submission_type_check;

alter table public.mission_submissions
  add constraint mission_submissions_submission_type_check
  check (submission_type in ('photo', 'video', 'signature', 'text', 'beatcoin'));

-- ----- Token storage -----
create table if not exists public.beatcoin_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  mission_id uuid not null references public.missions (id) on delete cascade,
  points int not null default 0 check (points >= 0),
  claimed_by_table_id uuid references public.tables (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint beatcoin_tokens_token_unique unique (token),
  constraint beatcoin_tokens_claim_consistent check (
    (claimed_at is null and claimed_by_table_id is null)
    or (claimed_at is not null and claimed_by_table_id is not null)
  )
);

create index if not exists beatcoin_tokens_mission_id_idx on public.beatcoin_tokens (mission_id);
create index if not exists beatcoin_tokens_claimed_at_idx on public.beatcoin_tokens (claimed_at);

comment on table public.beatcoin_tokens is 'Unique QR payloads; each row claimed at most once.';
comment on column public.beatcoin_tokens.token is 'Opaque string embedded in QR (use long random values).';

alter table public.beatcoin_tokens enable row level security;

-- Direct table access blocked; use peek_beatcoin / claim_beatcoin RPCs (security definer).

-- ----- Peek (claim UI): points + availability -----
create or replace function public.peek_beatcoin (p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.beatcoin_tokens%rowtype;
begin
  select * into v_row from public.beatcoin_tokens where token = trim(p_token) limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  return jsonb_build_object(
    'ok', true,
    'points', v_row.points,
    'mission_id', v_row.mission_id,
    'already_claimed', (v_row.claimed_at is not null)
  );
end;
$$;

-- ----- Atomic claim -----
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

  if v_row.claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
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

  update public.beatcoin_tokens
  set
    claimed_by_table_id = p_table_id,
    claimed_at = now()
  where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'points', v_row.points,
    'mission_submission_id', v_sub_id
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'claim_failed');
end;
$$;

grant execute on function public.peek_beatcoin (text) to anon, authenticated;
grant execute on function public.claim_beatcoin (text, uuid) to anon, authenticated;
