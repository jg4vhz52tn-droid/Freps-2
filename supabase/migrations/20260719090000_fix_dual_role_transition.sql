-- Bugfix: enforce_chapter_status_transition() checked "is_reviewer() first,
-- else owns_course()" -- for an account that is both creator and reviewer
-- (explicitly supported, profiles.is_reviewer is independent of role), this
-- meant the reviewer branch always won, blocking that user from submitting
-- their own chapters. Switch to checking the actual transition shape instead
-- of prioritizing one role over the other.
create or replace function public.enforce_chapter_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pruefung' and old.status in ('offen', 'ueberarbeitung', 'freigegeben')
       and public.owns_course(new.course_id) then
      null; -- valid creator (re)submit
    elsif new.status in ('freigegeben', 'ueberarbeitung') and old.status = 'pruefung'
       and public.is_reviewer() then
      null; -- valid reviewer decision
    else
      raise exception 'invalid chapter status transition: % -> %', old.status, new.status;
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
