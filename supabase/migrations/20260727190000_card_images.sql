-- Storage for images pasted directly into a Karteikarte's Frage/Antwort
-- field (e.g. a screenshot). Kept private (not a public bucket) -- access
-- is gated by the same ownership/purchase rules as the rest of a course's
-- content, enforced via RLS on storage.objects below. Object path
-- convention: <course_id>/<random-uuid>.<ext>, so ownership can be checked
-- straight from the path without a lookup table.
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', false)
on conflict (id) do nothing;

create policy "card-images: creator upload"
on storage.objects for insert
with check (
  bucket_id = 'card-images'
  and public.owns_course(((storage.foldername(name))[1])::uuid)
);

create policy "card-images: creator delete"
on storage.objects for delete
using (
  bucket_id = 'card-images'
  and public.owns_course(((storage.foldername(name))[1])::uuid)
);

-- Read access mirrors chapter_content: owner, reviewer, or someone who has
-- purchased the course. Simplification vs. chapter_content's own RLS: the
-- path only encodes the course, not the chapter, so a free-preview
-- chapter's image is NOT made visible to non-purchasers the way its text
-- already is -- a narrower, fail-safe gap rather than an over-exposure.
create policy "card-images: select entitled"
on storage.objects for select
using (
  bucket_id = 'card-images'
  and (
    public.owns_course(((storage.foldername(name))[1])::uuid)
    or public.is_reviewer()
    or public.has_purchased(((storage.foldername(name))[1])::uuid)
  )
);
