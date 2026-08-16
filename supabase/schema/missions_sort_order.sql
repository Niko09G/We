-- Manual display order for missions (admin cards + guest mission carousel).
alter table public.missions
  add column if not exists sort_order int not null default 0;

create index if not exists missions_sort_order_idx
  on public.missions (sort_order);

-- Backfill: spread existing rows by created_at so order is stable before admins tweak it.
with numbered as (
  select id, row_number() over (order by created_at asc nulls last, title asc) - 1 as ord
  from public.missions
)
update public.missions m
set sort_order = numbered.ord
from numbered
where m.id = numbered.id;
