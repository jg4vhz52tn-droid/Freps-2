-- 1) The admin course-metadata edit form (Hochschule/Fach/Professor/
-- Studiengänge/Semester) needs to rewrite a course's course_studiengaenge
-- rows too (delete old, insert new) -- "courses: admin update all" already
-- covers the courses row itself, but course_studiengaenge's existing write
-- policies are creator-only (owns_course()), so an admin editing a course
-- they didn't create would be silently blocked there. Same admin bypass
-- pattern as the courses table.
create policy "course_studiengaenge: admin insert all" on public.course_studiengaenge
  for insert with check (public.is_admin());

create policy "course_studiengaenge: admin delete all" on public.course_studiengaenge
  for delete using (public.is_admin());

-- 2) Admin-only force-publish / force-unpublish, to let an admin push an
-- unfinished course live (e.g. to demo/test) or pull a live course back to
-- in_arbeit, bypassing the normal all_chapters_approved()/transcript-accepted
-- gate that applies to a reviewer's regular publish action. Deliberately
-- gated on is_admin(), not is_reviewer(), so a plain reviewer (without admin
-- rights) keeps only the normal, fully-gated publish path -- this is an
-- admin escape hatch, not a relaxation of the reviewer workflow.
--
-- live -> in_arbeit was not a valid transition at all before this (fell into
-- the "else: invalid transition" branch) -- this adds it, admin-only.
create or replace function public.enforce_course_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'entwurf' and new.status = 'in_arbeit' then
      null; -- automatic bump, no role restriction needed

    elsif old.status = 'in_arbeit' and new.status = 'live' and public.is_admin() then
      if not public.session_token_valid() then
        raise exception 'session no longer active on this device -- please log in again';
      end if;
      -- Admin-Sonderweg: bewusst OHNE all_chapters_approved()- und
      -- transcript_status-Prüfung, das ist der Zweck dieses Übergangs.

    elsif old.status = 'in_arbeit' and new.status = 'live' then
      if not public.is_reviewer() then
        raise exception 'only a reviewer can publish a course';
      end if;
      if not public.session_token_valid() then
        raise exception 'session no longer active on this device -- please log in again';
      end if;
      if not public.all_chapters_approved(new.id) then
        raise exception 'all chapters must be freigegeben before publishing';
      end if;
      if new.transcript_status is distinct from 'angenommen' then
        raise exception 'transcript must be angenommen before publishing';
      end if;

    elsif old.status = 'live' and new.status = 'in_arbeit' and public.is_admin() then
      if not public.session_token_valid() then
        raise exception 'session no longer active on this device -- please log in again';
      end if;
      -- Admin-Sonderweg zum Zurücksetzen. Kein regulärer Übergang, daher
      -- ausdrücklich nur für Admins.

    else
      raise exception 'invalid course status transition: % -> %', old.status, new.status;
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
