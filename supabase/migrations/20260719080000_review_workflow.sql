-- Phase 2: full chapter content for review, course-wide content, and the
-- entwurf -> in_arbeit -> live course publishing workflow.

-- ---------------------------------------------------------------------------
-- chapters: persist the "Unterkapitel" notes from the Struktur step
-- ---------------------------------------------------------------------------
alter table public.chapters add column subchapters text;

-- ---------------------------------------------------------------------------
-- course_content: course-wide bausteine (Altklausuren/Tutorien/Zusatzmodule)
-- that the wizard itself treats as not belonging to any single chapter.
-- ---------------------------------------------------------------------------
create table public.course_content (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  type text not null,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (course_id, type)
);

create index course_content_course_id_idx on public.course_content (course_id);

alter table public.course_content enable row level security;

create policy "course_content: select visible" on public.course_content
  for select using (public.course_is_visible(course_id));

create policy "course_content: insert own course" on public.course_content
  for insert with check (public.owns_course(course_id));

create policy "course_content: update own course" on public.course_content
  for update using (public.owns_course(course_id));

-- ---------------------------------------------------------------------------
-- courses.status: add the 'in_arbeit' placeholder state between entwurf/live
-- ---------------------------------------------------------------------------
do $$
declare
  con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'public.courses'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if con is not null then
    execute format('alter table public.courses drop constraint %I', con);
  end if;
end $$;

alter table public.courses
  add constraint courses_status_check check (status in ('entwurf', 'in_arbeit', 'live'));

-- 'in_arbeit' courses are now publicly listable as a placeholder (title +
-- hochschule only, per the UI) -- course_is_visible()/chapters policies still
-- gate the actual content to live courses only.
drop policy "courses: select visible" on public.courses;
create policy "courses: select visible" on public.courses
  for select using (
    status in ('live', 'in_arbeit') or creator_id = auth.uid() or public.is_reviewer()
  );

-- The "Kurs veröffentlichen" button in Pruef-Dashboard is a reviewer action,
-- not the creator's -- the transition trigger below decides what's valid.
create policy "courses: reviewer update" on public.courses
  for update using (public.is_reviewer());

-- ---------------------------------------------------------------------------
-- chapters: allow the one extra transition this phase introduces --
-- editing an already-approved chapter's content reopens it for review.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_chapter_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if public.is_reviewer() then
      if old.status <> 'pruefung' or new.status not in ('freigegeben', 'ueberarbeitung') then
        raise exception 'invalid reviewer status transition: % -> %', old.status, new.status;
      end if;
    elsif public.owns_course(new.course_id) then
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

-- Saving chapter_content for an already-approved chapter automatically
-- reopens it (freigegeben -> pruefung), so unreviewed edits never stay live
-- silently. Goes through the transition function above like any other
-- status change, so no extra role check is needed here.
create function public.reopen_chapter_on_content_edit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.chapters set status = 'pruefung'
  where id = new.chapter_id and status = 'freigegeben';
  return new;
end;
$$;

create trigger chapter_content_reopens_chapter
  after insert or update on public.chapter_content
  for each row execute function public.reopen_chapter_on_content_edit();

-- ---------------------------------------------------------------------------
-- courses: entwurf -> in_arbeit (automatic, on first chapter submission) and
-- in_arbeit -> live (reviewer-only, only once every chapter is freigegeben)
-- ---------------------------------------------------------------------------
create function public.all_chapters_approved(p_course_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.chapters where course_id = p_course_id)
    and not exists (
      select 1 from public.chapters where course_id = p_course_id and status <> 'freigegeben'
    );
$$;

create function public.enforce_course_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'entwurf' and new.status = 'in_arbeit' then
      null; -- automatic bump, no role restriction needed
    elsif old.status = 'in_arbeit' and new.status = 'live' then
      if not public.is_reviewer() then
        raise exception 'only a reviewer can publish a course';
      end if;
      if not public.all_chapters_approved(new.id) then
        raise exception 'all chapters must be freigegeben before publishing';
      end if;
    else
      raise exception 'invalid course status transition: % -> %', old.status, new.status;
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger courses_status_transition
  before update on public.courses
  for each row execute function public.enforce_course_status_transition();

-- A course becomes 'in_arbeit' the moment any of its chapters leaves 'offen'
-- (i.e. gets submitted for the first time) -- the creator never sets this
-- directly, it's a side effect of submitting a chapter.
create function public.bump_course_status_on_chapter_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status <> 'offen' then
    update public.courses set status = 'in_arbeit'
    where id = new.course_id and status = 'entwurf';
  end if;
  return new;
end;
$$;

create trigger chapters_bump_course_status
  after insert or update on public.chapters
  for each row execute function public.bump_course_status_on_chapter_change();
