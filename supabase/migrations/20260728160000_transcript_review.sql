-- Transcript-of-Records review workflow.
--
-- Requested flow: a creator can upload their transcript and immediately start
-- building/submitting chapters -- the transcript review runs in parallel, not
-- as a blocker for chapter work. A reviewer sees pending transcripts in
-- Pruef-Dashboard.html and accepts or rejects them. The course can only go
-- fully "live" once BOTH all chapters are freigegeben AND the transcript has
-- been accepted -- otherwise the credential check would be toothless.

alter table public.courses add column transcript_status text
  check (transcript_status is null or transcript_status in ('ausstehend', 'angenommen', 'abgelehnt'));

-- Whenever a transcript file is (re)attached, the course automatically
-- (re)enters review -- a creator re-uploading after a rejection doesn't need
-- a reviewer to manually reset anything. Clearing the path (no transcript at
-- all) clears the status too, so there's no orphaned status with no file.
create function public.sync_transcript_status_on_path_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.transcript_path is distinct from old.transcript_path then
    new.transcript_status = case when new.transcript_path is null then null else 'ausstehend' end;
  end if;
  return new;
end;
$$;

create trigger courses_sync_transcript_status
  before update on public.courses
  for each row execute function public.sync_transcript_status_on_path_change();

-- Only a reviewer may decide on a pending transcript, and only forward from
-- 'ausstehend' -- mirrors enforce_chapter_status_transition's shape.
create function public.enforce_transcript_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.transcript_status is distinct from old.transcript_status
     and new.transcript_path is not distinct from old.transcript_path then
    if not public.is_reviewer() then
      raise exception 'only a reviewer can decide on a transcript';
    end if;
    if old.transcript_status is distinct from 'ausstehend'
       or new.transcript_status not in ('angenommen', 'abgelehnt') then
      raise exception 'invalid transcript status transition: % -> %', old.transcript_status, new.transcript_status;
    end if;
  end if;
  return new;
end;
$$;

create trigger courses_transcript_status_transition
  before update on public.courses
  for each row execute function public.enforce_transcript_status_transition();

-- A course may only go fully live once its transcript has been accepted too
-- -- otherwise the credential check never actually gates anything.
create or replace function public.enforce_course_status_transition()
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
      if new.transcript_status is distinct from 'angenommen' then
        raise exception 'transcript must be angenommen before publishing';
      end if;
    else
      raise exception 'invalid course status transition: % -> %', old.status, new.status;
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
