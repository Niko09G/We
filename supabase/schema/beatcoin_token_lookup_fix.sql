-- Beatcoin token lookup: trim, case-insensitive token match, and UUID id fallback.
-- Run in Supabase SQL Editor after token_redemptions_per_table.sql.

create or replace function public.resolve_beatcoin_token_row(p_token text)
returns public.beatcoin_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text := trim(coalesce(p_token, ''));
  v_row public.beatcoin_tokens%rowtype;
begin
  if v_trimmed = '' then
    return null;
  end if;

  select * into v_row
  from public.beatcoin_tokens
  where lower(trim(token)) = lower(v_trimmed)
  limit 1;

  if found then
    return v_row;
  end if;

  if v_trimmed ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select * into v_row
    from public.beatcoin_tokens
    where id = v_trimmed::uuid
    limit 1;

    if found then
      return v_row;
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.peek_beatcoin (p_token text, p_table_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.beatcoin_tokens;
  v_already boolean := false;
begin
  v_row := public.resolve_beatcoin_token_row(p_token);
  if v_row is null or v_row.id is null then
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

create or replace function public.claim_beatcoin (p_token text, p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resolved public.beatcoin_tokens;
  v_row public.beatcoin_tokens;
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

  v_resolved := public.resolve_beatcoin_token_row(p_token);
  if v_resolved is null or v_resolved.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_row
  from public.beatcoin_tokens
  where id = v_resolved.id
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

-- Admin reset: remove redemptions, delete linked submissions (leaderboard), clear legacy columns.
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

  select array_agg(distinct sub_id)
  into v_sub_ids
  from (
    select tr.mission_submission_id as sub_id
    from public.token_redemptions tr
    where tr.token_id = p_token_id
      and tr.mission_submission_id is not null
    union
    select ms.id as sub_id
    from public.mission_submissions ms
    where ms.submission_type = 'beatcoin'
      and ms.mission_id = v_token.mission_id
      and (
        ms.submission_data @> jsonb_build_object('beatcoin_token_id', p_token_id::text)
        or ms.submission_data @> jsonb_build_object('beatcoin_token_id', p_token_id)
      )
  ) s
  where sub_id is not null;

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
    'already_available', v_redemption_count = 0 and v_deleted = 0,
    'deleted_submissions', v_deleted,
    'deleted_redemptions', v_redemption_count
  );
end;
$$;

grant execute on function public.resolve_beatcoin_token_row(text) to anon, authenticated;
grant execute on function public.peek_beatcoin (text, uuid) to anon, authenticated;
grant execute on function public.claim_beatcoin (text, uuid) to anon, authenticated;
grant execute on function public.reset_beatcoin_token(uuid) to anon, authenticated;
