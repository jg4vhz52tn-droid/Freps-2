-- Security-audit fixes (see analysis round 2026-07-28):
--   K1: profiles.is_reviewer was settable by the row's own owner via the
--       client API (privilege escalation to full reviewer access).
--   K2: course_content (Altklausuren/Tutorien/Zusatz/Lernplan) was readable
--       on any visible course without checking has_purchased(), unlike
--       chapter_content which already gates on it.
--   K4: no delete policy existed on chapters at all -- a chapter removed
--       from the wizard became a permanent phantom row that
--       all_chapters_approved() kept waiting on forever.
--   W8: questions could be inserted for ANY course_id regardless of access,
--       and the creator's answer policy allowed rewriting question_text/
--       asked_by/course_id/chapter_id, not just the answer fields.

-- ---------------------------------------------------------------------------
-- K1: is_reviewer must never change via a normal authenticated client call.
-- auth.uid() is only non-null when the request carries an end-user JWT
-- (PostgREST via the anon/authenticated role) -- direct SQL-editor access
-- (as the migration owner) and any future service_role call carry no such
-- JWT, so this only blocks the client-facing path, matching every other
-- security-definer helper in this project that keys off auth.uid(). This
-- does NOT lock is_creator: that flag is an intentional, harmless
-- self-service switch (KFAuth.becomeCreator()), unlike is_reviewer which
-- grants access to every other creator's drafts plus approve/publish/
-- pricing power.
-- ---------------------------------------------------------------------------
create function public.lock_is_reviewer_column()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_reviewer is distinct from old.is_reviewer and auth.uid() is not null then
    raise exception 'is_reviewer cannot be changed via the client API';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_is_reviewer
  before update on public.profiles
  for each row execute function public.lock_is_reviewer_column();

-- ---------------------------------------------------------------------------
-- K2: course_content needs the same purchase gate chapter_content already
-- has. course_content has no per-item free-preview flag (that's a
-- chapters-only concept), so the equivalent here is simply: owner, reviewer,
-- or a purchaser of a live course.
-- ---------------------------------------------------------------------------
drop policy "course_content: select visible" on public.course_content;
create policy "course_content: select visible" on public.course_content
  for select using (
    public.owns_course(course_id)
    or public.is_reviewer()
    or (
      public.has_purchased(course_id)
      and exists (select 1 from public.courses where id = course_content.course_id and status = 'live')
    )
  );

-- ---------------------------------------------------------------------------
-- K4: allow a creator to delete their own chapter, but ONLY while it's still
-- 'offen' (never submitted) -- a chapter with any real review history
-- (pruefung/freigegeben/ueberarbeitung) can never be deleted this way, so no
-- reviewed content can vanish through this path.
-- ---------------------------------------------------------------------------
create policy "chapters: delete own if never submitted" on public.chapters
  for delete using (public.owns_course(course_id) and status = 'offen');

-- ---------------------------------------------------------------------------
-- W8a: a question may only be asked about a course the asker actually has
-- access to -- owner, reviewer, purchaser, or (for the chapter-scoped
-- bausteine) a free-preview chapter. Mirrors the access logic already used
-- for chapter_content/course_content instead of the bare "course exists"
-- check questions previously had.
-- ---------------------------------------------------------------------------
create function public.can_ask_question(p_course_id uuid, p_chapter_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    public.owns_course(p_course_id)
    or public.is_reviewer()
    or public.has_purchased(p_course_id)
    or (
      p_chapter_id is not null
      and exists (
        select 1 from public.chapters
        where id = p_chapter_id and is_free_preview and status = 'freigegeben'
      )
    );
$$;

drop policy "questions: insert own" on public.questions;
create policy "questions: insert own with access" on public.questions
  for insert with check (
    asked_by = auth.uid() and public.can_ask_question(course_id, chapter_id)
  );

-- ---------------------------------------------------------------------------
-- W8b: the creator's update policy only checks WHO may update a question,
-- not WHICH columns -- currently a creator could rewrite question_text,
-- reassign asked_by, or move the row to a different course/chapter. Lock
-- everything except the actual answer fields, regardless of which policy
-- authorized the update.
-- ---------------------------------------------------------------------------
create function public.enforce_question_answer_only()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.question_text is distinct from old.question_text
     or new.asked_by is distinct from old.asked_by
     or new.course_id is distinct from old.course_id
     or new.chapter_id is distinct from old.chapter_id
     or new.content_type is distinct from old.content_type
     or new.created_at is distinct from old.created_at then
    raise exception 'only answer_text, status, and is_public may be updated on a question';
  end if;
  return new;
end;
$$;

create trigger questions_lock_immutable_fields
  before update on public.questions
  for each row execute function public.enforce_question_answer_only();
