-- Vertical / map ordering for tables (admin seating lanes + guest seat map slots).
alter table public.tables
  add column if not exists display_order int not null default 0;

create index if not exists tables_display_order_idx
  on public.tables (display_order);

-- Stable initial order for existing rows (archived last, then name).
with numbered as (
  select
    id,
    (row_number() over (order by is_archived asc, name asc) - 1)::int as ord
  from public.tables
)
update public.tables t
set display_order = numbered.ord
from numbered
where t.id = numbered.id;
