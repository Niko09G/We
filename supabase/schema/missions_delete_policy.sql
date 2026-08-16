-- Allow anon delete for admin MVP (replace with auth later).
alter table public.missions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'missions'
      and policyname = 'Allow anon delete missions (MVP)'
  ) then
    create policy "Allow anon delete missions (MVP)"
      on public.missions
      for delete
      using (true);
  end if;
end $$;
