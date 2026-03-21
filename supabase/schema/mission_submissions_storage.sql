-- Mission proof submissions: storage bucket and mission metadata for signature guidance
-- Run in Supabase Dashboard → SQL Editor. Do not execute automatically.
--
-- STEP 1 — Create the bucket (required for photo/video/signature uploads).
--   In Dashboard: Storage → New bucket → Name: mission-submissions → Public: ON.
--   If the INSERT below fails (e.g. permission denied), create the bucket in the Dashboard instead.

-- Create bucket if it does not exist (id = name = 'mission-submissions', public for getPublicUrl).
insert into storage.buckets (id, name, public)
values ('mission-submissions', 'mission-submissions', true)
on conflict (id) do update set public = true;

-- STEP 2 — Policies so the app can upload and read (required for "Bucket not found" / upload failures).

drop policy if exists "Allow anon insert mission-submissions"
  on storage.objects;
create policy "Allow anon insert mission-submissions"
  on storage.objects for insert
  with check (bucket_id = 'mission-submissions');

drop policy if exists "Allow public read mission-submissions"
  on storage.objects;
create policy "Allow public read mission-submissions"
  on storage.objects for select
  using (bucket_id = 'mission-submissions');

-- ----- Mission metadata for signature missions -----
alter table public.missions
  add column if not exists target_person_name text,
  add column if not exists submission_hint text;

comment on column public.missions.target_person_name is 'Optional: who must sign (e.g. "Alex"). Shown on signature missions.';
comment on column public.missions.submission_hint is 'Optional: guidance for guest (e.g. "Use the seat finder to locate him").';
