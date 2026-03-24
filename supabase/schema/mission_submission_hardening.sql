-- Hardening for bursty event usage:
-- 1) Idempotency key on mission_submissions
-- 2) Duplicate mission-greeting guard
-- 3) Atomic mission submit RPC with per table/mission advisory lock
--
-- Run manually in Supabase SQL Editor.

alter table public.mission_submissions
  add column if not exists client_request_id text;

create unique index if not exists mission_submissions_client_request_unique
  on public.mission_submissions (table_id, mission_id, client_request_id)
  where (client_request_id is not null and btrim(client_request_id) <> '');

create unique index if not exists greetings_one_row_per_mission_submission
  on public.greetings (mission_submission_id)
  where (mission_submission_id is not null and source_type = 'mission');

create or replace function public.submit_mission_attempt(
  p_table_id uuid,
  p_mission_id uuid,
  p_submission_type text,
  p_submission_data jsonb default null,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missions_enabled boolean;
  v_setting jsonb;
  v_team record;
  v_mission record;
  v_effective_max int;
  v_is_repeatable_auto boolean;
  v_used int;
  v_existing record;
  v_inserted_id uuid;
  v_count int;
  v_message text;
  v_text text;
begin
  -- Serialize writes for this table+mission to avoid check-then-insert races.
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text || ':' || p_mission_id::text, 0));

  select value into v_setting from public.app_settings where key = 'missions_enabled' limit 1;
  if not found or v_setting is null then
    v_missions_enabled := true;
  else
    v_missions_enabled := not (v_setting = 'false'::jsonb);
  end if;
  if v_missions_enabled is not true then
    return jsonb_build_object('ok', false, 'error', 'missions_disabled');
  end if;

  if not exists (
    select 1
    from public.mission_assignments ma
    where ma.table_id = p_table_id
      and ma.mission_id = p_mission_id
      and ma.is_active = true
  ) then
    return jsonb_build_object('ok', false, 'error', 'mission_not_available');
  end if;

  select id, is_archived, coalesce(is_active, true) as is_active, name, color
  into v_team
  from public.tables
  where id = p_table_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'table_not_found');
  end if;
  if coalesce(v_team.is_archived, false) = true then
    return jsonb_build_object('ok', false, 'error', 'table_archived');
  end if;
  if coalesce(v_team.is_active, true) is not true then
    return jsonb_build_object('ok', false, 'error', 'table_inactive');
  end if;

  select
    id, title, approval_mode, allow_multiple_submissions, max_submissions_per_table,
    add_to_greetings, points_per_submission, message_required, validation_type
  into v_mission
  from public.missions
  where id = p_mission_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'mission_not_found');
  end if;
  if coalesce(v_mission.validation_type, '') = 'beatcoin' then
    return jsonb_build_object('ok', false, 'error', 'beatcoin_requires_qr_claim');
  end if;

  v_message := btrim(coalesce(p_submission_data->>'message', ''));
  v_text := btrim(coalesce(p_submission_data->>'text', ''));
  if p_submission_type = 'text' and v_text = '' then
    return jsonb_build_object('ok', false, 'error', 'text_required');
  end if;
  if coalesce(v_mission.message_required, false) = true and p_submission_type <> 'text' and v_message = '' then
    return jsonb_build_object('ok', false, 'error', 'message_required');
  end if;

  if v_mission.max_submissions_per_table is not null and v_mission.max_submissions_per_table >= 1 then
    v_effective_max := v_mission.max_submissions_per_table;
  elsif coalesce(v_mission.allow_multiple_submissions, false) = true then
    v_effective_max := null;
  else
    v_effective_max := 1;
  end if;

  v_is_repeatable_auto :=
    coalesce(v_mission.approval_mode, 'manual') = 'auto' and (v_effective_max is null or v_effective_max > 1);

  if v_effective_max = 1 and exists (
    select 1
    from public.completions c
    where c.table_id = p_table_id
      and c.mission_id = p_mission_id
    limit 1
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_completed');
  end if;

  if p_client_request_id is not null and btrim(p_client_request_id) <> '' then
    select id, status
    into v_existing
    from public.mission_submissions ms
    where ms.table_id = p_table_id
      and ms.mission_id = p_mission_id
      and ms.client_request_id = btrim(p_client_request_id)
    order by ms.created_at desc
    limit 1;

    if found then
      if v_existing.status = 'approved' then
        select count(*)::int into v_count
        from public.mission_submissions ms
        where ms.table_id = p_table_id
          and ms.mission_id = p_mission_id
          and ms.status = 'approved';
      else
        v_count := null;
      end if;

      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'auto_approved', (v_existing.status = 'approved'),
        'repeatable', (v_effective_max is null or v_effective_max > 1),
        'approved_count', v_count,
        'mission_submission_id', v_existing.id
      );
    end if;
  end if;

  select count(*)::int into v_used
  from public.mission_submissions ms
  where ms.table_id = p_table_id
    and ms.mission_id = p_mission_id
    and ms.status in ('pending', 'approved');

  if v_effective_max is not null and v_used >= v_effective_max then
    return jsonb_build_object('ok', false, 'error', 'submission_limit_reached');
  end if;

  insert into public.mission_submissions (
    table_id, mission_id, status, submission_type, submission_data, approved_at, client_request_id
  )
  values (
    p_table_id,
    p_mission_id,
    case when v_is_repeatable_auto then 'approved' else 'pending' end,
    p_submission_type,
    p_submission_data,
    case when v_is_repeatable_auto then now() else null end,
    nullif(btrim(coalesce(p_client_request_id, '')), '')
  )
  returning id into v_inserted_id;

  if v_is_repeatable_auto and p_submission_type = 'photo' and coalesce(v_mission.add_to_greetings, false) = true then
    if coalesce(p_submission_data->>'image_url', '') <> '' then
      begin
        insert into public.greetings (
          name, message, image_url, status, source_type, table_id, table_name, table_color, mission_submission_id
        )
        values (
          v_team.name,
          coalesce(nullif(v_message, ''), coalesce(v_mission.title, 'Greeting')),
          p_submission_data->>'image_url',
          'ready',
          'mission',
          p_table_id,
          v_team.name,
          v_team.color,
          v_inserted_id
        );
      exception
        when unique_violation then
          null;
      end;
    end if;
  end if;

  if v_is_repeatable_auto then
    select count(*)::int into v_count
    from public.mission_submissions ms
    where ms.table_id = p_table_id
      and ms.mission_id = p_mission_id
      and ms.status = 'approved';
  else
    v_count := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'auto_approved', v_is_repeatable_auto,
    'repeatable', (v_effective_max is null or v_effective_max > 1),
    'approved_count', v_count,
    'mission_submission_id', v_inserted_id
  );
end;
$$;

grant execute on function public.submit_mission_attempt(uuid, uuid, text, jsonb, text)
  to anon, authenticated;

