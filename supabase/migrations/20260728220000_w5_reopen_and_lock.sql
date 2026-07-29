-- W5: freigegeben/live content could be changed without triggering re-review
-- in two places the earlier chapter_content-only reopen trigger didn't cover:
--   1. syncCourseContent() upserts chapters.title/subchapters directly (not
--      through chapter_content), so retitling an approved chapter's heading
--      never reopened it.
--   2. getOrCreateDraftCourse() upserts courses.professor/semester/
--      hochschule_id/title on every save, including for a course that's
--      already 'live' -- a creator could quietly change who/when a live
--      course is for without any re-review at all.
--
-- Also fixes a regression from 20260728190000_session_hook_phase2.sql: that
-- migration's create-or-replace of enforce_chapter_status_transition()
-- accidentally reverted the creator branch to the ORIGINAL (pre-
-- 20260719080000) allowed-old-status list, dropping 'freigegeben' -- which
-- silently broke the existing chapter_content reopen-on-edit mechanism
-- for every non-reviewer creator since that migration went live. Caught
-- while re-deriving this same trigger for the fix below; restored here.

create or replace function public.enforce_chapter_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if public.is_reviewer() then
      if not public.session_token_valid() then
        raise exception 'session no longer active on this device -- please log in again';
      end if;
      if old.status <> 'pruefung' or new.status not in ('freigegeben', 'ueberarbeitung') then
        raise exception 'invalid reviewer status transition: % -> %', old.status, new.status;
      end if;
    elsif public.owns_course(new.course_id) then
      if not public.session_token_valid() then
        raise exception 'session no longer active on this device -- please log in again';
      end if;
      if new.status <> 'pruefung' or old.status not in ('offen', 'ueberarbeitung', 'freigegeben') then
        raise exception 'invalid creator status transition: % -> %', old.status, new.status;
      end if;
    else
      raise exception 'not allowed to change chapter status';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Editing title/subchapters of an approved chapter reopens it, exactly
-- like editing its chapter_content already does. This fires BEFORE
-- chapters_status_transition (alphabetically "r" < "s"), so it sets NEW
-- directly and the transition-enforcement trigger sees a normal, already-
-- allowed freigegeben -> pruefung change -- no recursive update needed
-- (unlike the chapter_content trigger, which has to reach across tables).
-- ---------------------------------------------------------------------------
create function public.reopen_chapter_on_metadata_edit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is not distinct from old.status
     and old.status = 'freigegeben'
     and (new.title is distinct from old.title or new.subchapters is distinct from old.subchapters) then
    new.status := 'pruefung';
  end if;
  return new;
end;
$$;

create trigger chapters_reopen_on_metadata_edit
  before update on public.chapters
  for each row execute function public.reopen_chapter_on_metadata_edit();

-- ---------------------------------------------------------------------------
-- 2. Course master data (Hochschule/Titel/Professor/Semester) is locked once
-- a course is live -- simpler and safer than adding a whole "take a live
-- course back into review" transition that doesn't exist anywhere else in
-- this workflow yet. If that's ever needed, it's a separate, bigger feature;
-- for now the creator gets a clear error instead of a silent, unreviewed
-- change to a course learners have already purchased.
-- ---------------------------------------------------------------------------
create function public.lock_course_master_data_when_live()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'live' and (
    new.hochschule_id is distinct from old.hochschule_id
    or new.title is distinct from old.title
    or new.professor is distinct from old.professor
    or new.semester is distinct from old.semester
  ) then
    raise exception 'course master data (Hochschule/Titel/Professor/Semester) cannot be changed while the course is live';
  end if;
  return new;
end;
$$;

create trigger courses_lock_master_data_when_live
  before update on public.courses
  for each row execute function public.lock_course_master_data_when_live();
