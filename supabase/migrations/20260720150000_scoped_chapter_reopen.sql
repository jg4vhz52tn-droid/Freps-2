-- Bugfix: submitting/saving one chapter was reopening OTHER already-
-- freigegeben chapters of the same course too.
--
-- Root cause: syncCourseContent() (kf-supabase.js) re-upserts chapter_content
-- rows for every chapter in the course on every save, not just the edited
-- one -- it has no way to know which chapter actually changed on the client.
-- The chapter_content_reopens_chapter trigger then unconditionally reset
-- status='freigegeben' -> 'pruefung' on ANY insert/update of a chapter's
-- content row, even when the re-synced content was byte-identical to what
-- was already stored.
--
-- Fix at the trigger level (not the client): only reopen a chapter when its
-- content actually changed. This makes the guarantee "a chapter's status
-- only changes when that chapter's own content changes" hold regardless of
-- how the client batches its saves.
create or replace function public.reopen_chapter_on_content_edit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.content is not distinct from new.content then
    return new;
  end if;
  update public.chapters set status = 'pruefung'
  where id = new.chapter_id and status = 'freigegeben';
  return new;
end;
$$;
