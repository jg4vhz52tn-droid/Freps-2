-- Row Level Security for Klausurfuchs.
-- Learners/creators only see & touch their own data; reviewers (profiles.is_reviewer)
-- can see and act on all chapter submissions.

-- ---------------------------------------------------------------------------
-- helper functions (security definer: read the underlying tables regardless
-- of the caller's own RLS, reused across every policy below)
-- ---------------------------------------------------------------------------
create function public.is_reviewer()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_reviewer from public.profiles where id = auth.uid()), false);
$$;

create function public.owns_course(p_course_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.courses
    where id = p_course_id and creator_id = auth.uid()
  );
$$;

create function public.owns_chapter(p_chapter_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.chapters c
    join public.courses co on co.id = c.course_id
    where c.id = p_chapter_id and co.creator_id = auth.uid()
  );
$$;

create function public.course_is_visible(p_course_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.courses
    where id = p_course_id
      and (status = 'live' or creator_id = auth.uid())
  ) or public.is_reviewer();
$$;

-- ---------------------------------------------------------------------------
-- chapters: only allow the 3 status transitions the app actually performs
-- (submit / approve / requestChanges), regardless of which columns a caller
-- otherwise passed RLS to update.
-- ---------------------------------------------------------------------------
create function public.enforce_chapter_status_transition()
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

create trigger chapters_status_transition
  before update on public.chapters
  for each row execute function public.enforce_chapter_status_transition();

-- ---------------------------------------------------------------------------
-- enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.hochschulen enable row level security;
alter table public.studiengaenge enable row level security;
alter table public.courses enable row level security;
alter table public.course_studiengaenge enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_content enable row level security;
alter table public.chapter_comments enable row level security;
alter table public.purchases enable row level security;
alter table public.learning_progress enable row level security;

-- profiles ---------------------------------------------------------------
create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- hochschulen / studiengaenge: public catalog reference data --------------
create policy "hochschulen: public read" on public.hochschulen
  for select using (true);

create policy "hochschulen: authenticated insert" on public.hochschulen
  for insert with check (auth.uid() is not null);

create policy "studiengaenge: public read" on public.studiengaenge
  for select using (true);

create policy "studiengaenge: authenticated insert" on public.studiengaenge
  for insert with check (auth.uid() is not null);

-- courses ------------------------------------------------------------------
create policy "courses: select visible" on public.courses
  for select using (
    status = 'live' or creator_id = auth.uid() or public.is_reviewer()
  );

create policy "courses: insert own" on public.courses
  for insert with check (creator_id = auth.uid());

create policy "courses: update own" on public.courses
  for update using (creator_id = auth.uid());

-- course_studiengaenge: follows the parent course's visibility -------------
create policy "course_studiengaenge: select visible" on public.course_studiengaenge
  for select using (public.course_is_visible(course_id));

create policy "course_studiengaenge: write own course" on public.course_studiengaenge
  for insert with check (public.owns_course(course_id));

create policy "course_studiengaenge: delete own course" on public.course_studiengaenge
  for delete using (public.owns_course(course_id));

-- chapters -------------------------------------------------------------------
create policy "chapters: select visible" on public.chapters
  for select using (
    (status = 'freigegeben' and public.course_is_visible(course_id))
    or public.owns_course(course_id)
    or public.is_reviewer()
  );

create policy "chapters: insert own course" on public.chapters
  for insert with check (public.owns_course(course_id));

create policy "chapters: update own or reviewer" on public.chapters
  for update using (public.owns_course(course_id) or public.is_reviewer());

-- chapter_content: authored only by the owning creator ----------------------
create policy "chapter_content: select visible" on public.chapter_content
  for select using (
    public.owns_chapter(chapter_id)
    or public.is_reviewer()
    or exists (
      select 1 from public.chapters c
      where c.id = chapter_content.chapter_id
        and c.status = 'freigegeben'
        and public.course_is_visible(c.course_id)
    )
  );

create policy "chapter_content: write own chapter" on public.chapter_content
  for insert with check (public.owns_chapter(chapter_id));

create policy "chapter_content: update own chapter" on public.chapter_content
  for update using (public.owns_chapter(chapter_id));

-- chapter_comments: review thread between course owner and reviewers -------
create policy "chapter_comments: select owner or reviewer" on public.chapter_comments
  for select using (public.owns_chapter(chapter_id) or public.is_reviewer());

create policy "chapter_comments: insert owner or reviewer" on public.chapter_comments
  for insert with check (public.owns_chapter(chapter_id) or public.is_reviewer());

-- purchases: only the buyer can see/create their own record ----------------
create policy "purchases: select own" on public.purchases
  for select using (user_id = auth.uid());

create policy "purchases: insert own" on public.purchases
  for insert with check (user_id = auth.uid());

-- learning_progress: only the learner can see/update their own state ------
create policy "learning_progress: select own" on public.learning_progress
  for select using (user_id = auth.uid());

create policy "learning_progress: insert own" on public.learning_progress
  for insert with check (user_id = auth.uid());

create policy "learning_progress: update own" on public.learning_progress
  for update using (user_id = auth.uid());
