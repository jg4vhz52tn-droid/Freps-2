-- Ultra-Account role: is_admin. Same protection class as is_reviewer (K1) --
-- settable only via direct SQL / migration-owner access, never through the
-- client API. An admin automatically gets full reviewer power (approve/
-- publish/bypass-purchase everywhere is_reviewer() is already checked) via
-- the is_reviewer() redefinition below, plus three new admin-only read
-- surfaces (profiles/purchases/questions) that plain reviewers still don't
-- get, for the new admin-dashboard.html.

alter table public.profiles add column is_admin boolean not null default false;

create function public.lock_is_admin_column()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'is_admin cannot be changed via the client API';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_is_admin
  before update on public.profiles
  for each row execute function public.lock_is_admin_column();

create function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- is_reviewer() redefined: an admin automatically has every reviewer right
-- (approve/reject chapters, publish courses, accept/reject transcripts,
-- confirm bundles, manage hochschulen/studiengaenge) AND bypasses
-- has_purchased() everywhere it's checked (chapter_content, course_content,
-- can_ask_question, card-images storage) -- all four has_purchased() call
-- sites already OR in is_reviewer(), so this single redefinition satisfies
-- both requirements without touching any of those policies.
create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select is_reviewer or is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Admin-only read surfaces for admin-dashboard.html. Deliberately NOT folded
-- into is_reviewer(): letting every reviewer see every user's email
-- (profiles), every purchase record, or every platform-wide open question
-- would be a real over-grant with no legitimate reviewer use case.
create policy "profiles: admin select all" on public.profiles
  for select using (public.is_admin());

create policy "purchases: admin select all" on public.purchases
  for select using (public.is_admin());

create policy "questions: admin select all" on public.questions
  for select using (public.is_admin());
