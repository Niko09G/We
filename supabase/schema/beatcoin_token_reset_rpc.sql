-- Atomic admin token reset/unclaim in one transaction.
-- Run manually in Supabase SQL Editor.

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
begin
  select id, mission_id, claimed_at
  into v_token
  from public.beatcoin_tokens
  where id = p_token_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'token_not_found');
  end if;

  if v_token.claimed_at is null then
    return jsonb_build_object('ok', true, 'already_available', true, 'deleted_submissions', 0);
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

  update public.beatcoin_tokens
  set claimed_by_table_id = null,
      claimed_at = null
  where id = p_token_id;

  return jsonb_build_object(
    'ok', true,
    'already_available', false,
    'deleted_submissions', v_deleted
  );
end;
$$;

grant execute on function public.reset_beatcoin_token(uuid) to anon, authenticated;

