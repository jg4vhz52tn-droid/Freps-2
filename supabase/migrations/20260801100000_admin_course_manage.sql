-- Admins can rename and delete ANY course (not just their own, and
-- regardless of status) -- e.g. to fix "Unbenannter Kurs" drafts that were
-- never renamed by their creator, or to remove empty/broken test courses,
-- including already-live ones. Both are separate policies from the
-- creator-facing ones ("courses: update own" if present / "courses: delete
-- own if not live" from the course-delete migration), which stay unchanged
-- and keep applying to non-admin creators.
create policy "courses: admin update all" on public.courses
  for update using (public.is_admin()) with check (public.is_admin());

-- Cascades for chapters/chapter_content/chapter_comments/course_content/
-- purchases/learning_progress already exist (on delete cascade in the base
-- schema migration) -- no further schema changes needed.
create policy "courses: admin delete all" on public.courses
  for delete using (public.is_admin());
