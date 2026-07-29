-- K5: real Notennachweis (Transcript of Records) upload -- this is the
-- platform's central trust feature, so it must actually store the file
-- instead of just faking a success message.
--
-- The upload happens in view-creator-setup, BEFORE a course row exists (the
-- course is only created once the wizard is entered), so the object path
-- can't be keyed by course_id like card-images is -- it's keyed by the
-- uploading user's id instead, and the resulting path gets attached to the
-- course row once ensureCourseId() resolves one.
alter table public.courses add column transcript_path text;

insert into storage.buckets (id, name, public)
values ('transcripts', 'transcripts', false)
on conflict (id) do nothing;

create policy "transcripts: own upload"
on storage.objects for insert
with check (
  bucket_id = 'transcripts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "transcripts: own delete"
on storage.objects for delete
using (
  bucket_id = 'transcripts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Only the uploader themselves or a reviewer (checking the transcript claim
-- against the exam) may ever read a transcript back.
create policy "transcripts: select own or reviewer"
on storage.objects for select
using (
  bucket_id = 'transcripts'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_reviewer()
  )
);
