-- Phase 3: prepare the data structure for the business model (no real
-- payment yet) -- simplified signup, Google login, purchase-gated content,
-- and course bundles.

-- ---------------------------------------------------------------------------
-- profiles: replace the exclusive "role" field with an is_creator flag
-- (analogous to is_reviewer) -- an account can be learner and creator at
-- once. is_creator starts false for everyone and flips to true the moment
-- the creator flow is entered (KFAuth.becomeCreator()), not at signup.
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_creator boolean not null default false;
update public.profiles set is_creator = true where role = 'creator';
alter table public.profiles drop column role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- chapters: a creator can mark a chapter as a free preview, visible without
-- a purchase (see the chapter_content policy below).
-- ---------------------------------------------------------------------------
alter table public.chapters add column is_free_preview boolean not null default false;

-- ---------------------------------------------------------------------------
-- purchases already exists (schema migration) -- add the helper function and
-- gate chapter_content behind it: visible to the creator, any reviewer, or
-- someone who has purchased the course, or if the chapter is a free preview.
-- ---------------------------------------------------------------------------
create function public.has_purchased(p_course_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.purchases
    where course_id = p_course_id and user_id = auth.uid()
  );
$$;

drop policy "chapter_content: select visible" on public.chapter_content;
create policy "chapter_content: select visible" on public.chapter_content
  for select using (
    public.owns_chapter(chapter_id)
    or public.is_reviewer()
    or exists (
      select 1 from public.chapters c
      where c.id = chapter_content.chapter_id
        and c.status = 'freigegeben'
        and public.course_is_visible(c.course_id)
        and (c.is_free_preview or public.has_purchased(c.course_id))
    )
  );

-- ---------------------------------------------------------------------------
-- settings: key/value config for the (future) payment model, so prices and
-- payout rules are never hard-coded in the app.
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings: public read" on public.settings
  for select using (true);

create policy "settings: reviewer update" on public.settings
  for update using (public.is_reviewer());

insert into public.settings (key, value) values
  ('course_price', '29'),
  ('bundle_price', '49'),
  ('creator_share_percent', '50'),
  ('payout_day', '1');

-- ---------------------------------------------------------------------------
-- course_bundles: links exactly two existing courses as a "Doppelmodul"
-- pair. A free-text bundle partner (the other course doesn't exist in the
-- system yet) is stored directly on the course as a plain note instead --
-- it has no second course page to confirm against, so it never becomes a
-- real course_bundles row.
-- ---------------------------------------------------------------------------
alter table public.courses add column bundle_note text;

create table public.course_bundles (
  id uuid primary key default gen_random_uuid(),
  course_id_a uuid not null references public.courses (id) on delete cascade,
  course_id_b uuid not null references public.courses (id) on delete cascade,
  status text not null default 'vorgeschlagen' check (status in ('vorgeschlagen', 'bestaetigt')),
  proposed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (course_id_a <> course_id_b)
);

create index course_bundles_course_id_a_idx on public.course_bundles (course_id_a);
create index course_bundles_course_id_b_idx on public.course_bundles (course_id_b);

alter table public.course_bundles enable row level security;

-- A course can only ever be linked to one bundle partner at a time,
-- regardless of status (pending or confirmed) and regardless of which side
-- (a or b) it would occupy.
create function public.enforce_single_bundle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.course_bundles
    where id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (course_id_a in (new.course_id_a, new.course_id_b) or course_id_b in (new.course_id_a, new.course_id_b))
  ) then
    raise exception 'a course can only be linked to one bundle partner at a time';
  end if;
  return new;
end;
$$;

create trigger course_bundles_single
  before insert or update on public.course_bundles
  for each row execute function public.enforce_single_bundle();

-- Only the transition vorgeschlagen -> bestaetigt is allowed, and only a
-- reviewer may perform it -- mirrors enforce_chapter_status_transition.
create function public.enforce_bundle_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and not (old.status = 'vorgeschlagen' and new.status = 'bestaetigt' and public.is_reviewer()) then
    raise exception 'invalid bundle status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

create trigger course_bundles_status_transition
  before update on public.course_bundles
  for each row execute function public.enforce_bundle_status_transition();

create policy "course_bundles: select visible" on public.course_bundles
  for select using (
    public.owns_course(course_id_a) or public.owns_course(course_id_b) or public.is_reviewer()
    or (status = 'bestaetigt' and public.course_is_visible(course_id_a) and public.course_is_visible(course_id_b))
  );

create policy "course_bundles: propose own course" on public.course_bundles
  for insert with check (public.owns_course(course_id_a) and proposed_by = auth.uid());

create policy "course_bundles: reviewer confirm" on public.course_bundles
  for update using (public.is_reviewer())
  with check (public.is_reviewer());

create policy "course_bundles: delete own pending or reviewer" on public.course_bundles
  for delete using (
    (public.owns_course(course_id_a) and status = 'vorgeschlagen') or public.is_reviewer()
  );
