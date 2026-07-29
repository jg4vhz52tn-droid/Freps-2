-- W1 phase 2: actually enforce session_token_valid() (see phase 1 migration
-- for the hook itself) on the security-relevant writes: chapter status
-- transitions (submit / approve / reject), course publish, and profile
-- updates. Only apply this AFTER confirming the custom access token hook is
-- enabled in the dashboard and every currently-open session has refreshed at
-- least once (log out/in) -- otherwise a still-valid pre-hook JWT (no
-- session_token claim at all) will fail every one of these checks until it
-- naturally refreshes.

-- ---------------------------------------------------------------------------
-- chapters: same transitions as before, now also requiring that whichever
-- side (reviewer or creator) is acting still holds the session currently on
-- file for their account.
-- ---------------------------------------------------------------------------
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
      if new.status <> 'pruefung' or old.status not in ('offen', 'ueberarbeitung') then
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
-- courses: publish still requires is_reviewer() + all_chapters_approved() +
-- transcript accepted, now also a still-valid session for the reviewer
-- doing the publishing.
-- ---------------------------------------------------------------------------
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
      if not public.session_token_valid() then
        raise exception 'session no longer active on this device -- please log in again';
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

-- ---------------------------------------------------------------------------
-- profiles: a session kicked out by a newer login on another device can no
-- longer touch its own profile row either (e.g. becomeCreator()).
--
-- This is deliberately a trigger, not an RLS USING/WITH CHECK addition: an
-- UPDATE policy with no explicit WITH CHECK reuses its USING qual against
-- the row's NEW (post-update) state too. session_token_valid() compares the
-- row's active_session_token against this request's JWT claim -- but
-- claimDeviceSession() (the login flow itself) writes a brand new token, so
-- the post-update row would already hold a value the still-old JWT claim
-- can't match, and the update would reject itself. A BEFORE trigger sees
-- OLD/NEW explicitly, so it can special-case exactly that one legitimate
-- write (claiming a new session is always allowed for the row's own owner
-- -- that's what invalidates every OTHER session) while still requiring a
-- currently-valid session for every other profile change.
-- ---------------------------------------------------------------------------
create function public.enforce_profile_update_session()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.active_session_token is distinct from old.active_session_token then
    return new;
  end if;
  if auth.uid() is not null and not public.session_token_valid() then
    raise exception 'session no longer active on this device -- please log in again';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_session_on_update
  before update on public.profiles
  for each row execute function public.enforce_profile_update_session();
