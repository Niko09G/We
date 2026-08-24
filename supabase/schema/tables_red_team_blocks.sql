-- Optional: split the Red team into two physical seating blocks that share one team_id.
-- Run AFTER supabase/schema/tables_team_id.sql. Idempotent.
--
-- Result:
--   teams.name stays the original Red team name (leaderboard / lobby)
--   physical tables "Red Block A" + "Red Block B" both point at that team_id

do $red$
declare
  red public.tables%rowtype;
  team uuid;
  next_order int;
begin
  select * into red
  from public.tables
  where coalesce(is_archived, false) = false
    and (
      name ilike '%red%'
      or name ilike '%karang%'
    )
  order by display_order, name
  limit 1;

  if red.id is null then
    raise notice 'No Red team table found; skipping block split.';
    return;
  end if;

  team := coalesce(red.team_id, red.id);

  insert into public.teams (id, name)
  values (team, red.name)
  on conflict (id) do nothing;

  update public.tables
  set team_id = team
  where id = red.id
    and team_id is distinct from team;

  if exists (
    select 1
    from public.tables
    where team_id = team
      and id <> red.id
      and coalesce(is_archived, false) = false
  ) then
    raise notice 'Red team already has a sibling physical table; skipping.';
    return;
  end if;

  if red.name not ilike '%block%' then
    update public.tables
    set name = 'Red Block A'
    where id = red.id;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.tables;

  insert into public.tables (
    name,
    color,
    is_active,
    is_archived,
    archived_at,
    capacity,
    display_order,
    page_config,
    team_id
  )
  values (
    'Red Block B',
    red.color,
    coalesce(red.is_active, true),
    false,
    null,
    greatest(coalesce(red.capacity, 10), 1),
    next_order,
    coalesce(red.page_config, '{}'::jsonb),
    team
  );
end
$red$;
