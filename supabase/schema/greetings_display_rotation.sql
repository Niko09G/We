-- Big-screen fair rotation: lowest display_count first, then newest first among ties.
-- Run in Supabase SQL Editor.

alter table public.greetings
  add column if not exists display_count integer not null default 0;

alter table public.greetings
  add column if not exists last_displayed_at timestamptz;

comment on column public.greetings.display_count is 'Times this greeting was shown on the big screen; drives fair rotation.';
comment on column public.greetings.last_displayed_at is 'Last time the big screen advanced to this greeting (after show).';

create index if not exists greetings_ready_display_rotation_idx
  on public.greetings (display_count asc, created_at desc)
  where status = 'ready';

create or replace function public.record_greeting_displayed(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.greetings
  set
    display_count = display_count + 1,
    last_displayed_at = now()
  where id = p_id
    and status = 'ready';
end;
$$;

grant execute on function public.record_greeting_displayed(uuid)
  to anon, authenticated;
