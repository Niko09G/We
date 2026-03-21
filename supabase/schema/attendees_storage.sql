-- Attendee profile photos: storage bucket + policies.
-- Run in Supabase SQL Editor after creating the bucket (or use INSERT below).
--
-- Dashboard: Storage → New bucket → name: attendees → Public: ON (for getPublicUrl).

insert into storage.buckets (id, name, public)
values ('attendees', 'attendees', true)
on conflict (id) do update set public = true;

drop policy if exists "Allow anon insert attendees bucket"
  on storage.objects;
create policy "Allow anon insert attendees bucket"
  on storage.objects for insert
  with check (bucket_id = 'attendees');

drop policy if exists "Allow anon update attendees bucket"
  on storage.objects;
create policy "Allow anon update attendees bucket"
  on storage.objects for update
  using (bucket_id = 'attendees')
  with check (bucket_id = 'attendees');

drop policy if exists "Allow public read attendees bucket"
  on storage.objects;
create policy "Allow public read attendees bucket"
  on storage.objects for select
  using (bucket_id = 'attendees');
