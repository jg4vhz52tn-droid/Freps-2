-- Bugfix, caught live: an account that is BOTH a reviewer AND owns the
-- course being edited always hit the is_reviewer() branch first in
-- enforce_chapter_status_transition() (that check ran unconditionally
-- before owns_course()) -- so the new chapters_reopen_on_metadata_edit
-- trigger's freigegeben -> pruefung reopen got evaluated as a *reviewer*
-- transition, which only ever allows pruefung -> (freigegeben, ueberarbeitung).
-- Result: a reviewer editing their own already-approved chapter's title
-- couldn't save at all ("invalid reviewer status transition: freigegeben ->
-- pruefung"), regression-tested by literally trying it against the real DB.
--
-- Fix: check for the specific creator-side transition shape (new='pruefung',
-- old in the three creator-allowed starting states) FIRST, gated only on
-- owns_course() -- independent of whether that same account also happens to
-- be a reviewer. Falls through to the existing reviewer branch for every
-- other case, so reviewer-only approvals of someone else's course are
-- unaffected.
create or replace function public.enforce_chapter_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if public.owns_course(new.course_id)
       and new.status = 'pruefung' and old.status in ('offen', 'ueberarbeitung', 'freigegeben') then
      if not public.session_token_valid() then
        raise exception 'session no longer active on this device -- please log in again';
      end if;
    elsif public.is_reviewer() then
      if not public.session_token_valid() then
        raise exception 'session no longer active on this device -- please log in again';
      end if;
      if old.status <> 'pruefung' or new.status not in ('freigegeben', 'ueberarbeitung') then
        raise exception 'invalid reviewer status transition: % -> %', old.status, new.status;
      end if;
    elsif public.owns_course(new.course_id) then
      raise exception 'invalid creator status transition: % -> %', old.status, new.status;
    else
      raise exception 'not allowed to change chapter status';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
