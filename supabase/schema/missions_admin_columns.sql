-- Mission management columns (run in Supabase SQL Editor before testing admin missions)

alter table public.missions
  add column if not exists validation_type text not null default 'manual',
  add column if not exists is_active boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'missions_validation_type_check'
  ) then
    alter table public.missions
      add constraint missions_validation_type_check
      check (validation_type in ('signature', 'photo', 'manual'));
  end if;
end $$;

-- Allow anon insert/update for admin MVP (replace with auth later)
create policy "Allow anonymous insert missions"
  on public.missions for insert with check (true);

create policy "Allow anonymous update missions"
  on public.missions for update using (true);
