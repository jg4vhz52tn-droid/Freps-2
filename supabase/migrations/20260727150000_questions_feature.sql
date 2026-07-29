-- Tutorfragen: learners ask questions on a specific baustein of a course
-- they can see; the course's creator answers. Answers can optionally be
-- marked public, turning them into a per-baustein FAQ visible to anyone
-- with access to the course.

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete cascade,
  content_type text not null check (content_type in (
    'zusammenfassung', 'karteikarten', 'uebungen', 'altklausuren', 'tutorien', 'zusatz'
  )),
  asked_by uuid not null references public.profiles (id) on delete cascade,
  question_text text not null,
  status text not null default 'offen' check (status in ('offen', 'beantwortet')),
  answer_text text,
  answered_at timestamptz,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  -- chapter_id is only meaningful for the per-chapter bausteine; the
  -- course-wide ones (altklausuren/tutorien/zusatz) never have one.
  check (
    (content_type in ('zusammenfassung', 'karteikarten', 'uebungen') and chapter_id is not null)
    or (content_type in ('altklausuren', 'tutorien', 'zusatz') and chapter_id is null)
  )
);

create index questions_course_id_idx on public.questions (course_id);
create index questions_chapter_id_idx on public.questions (chapter_id);
create index questions_asked_by_idx on public.questions (asked_by);

alter table public.questions enable row level security;

create policy "questions: select own, creator, or public" on public.questions
  for select using (
    asked_by = auth.uid()
    or public.owns_course(course_id)
    or (is_public and public.course_is_visible(course_id))
  );

create policy "questions: insert own" on public.questions
  for insert with check (asked_by = auth.uid());

create policy "questions: creator answers" on public.questions
  for update using (public.owns_course(course_id));

-- Server-sets answered_at the moment a question actually flips to
-- 'beantwortet' -- not left to the client to stamp, so it can't drift or be
-- forgotten.
create function public.set_question_answered_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'beantwortet' and old.status is distinct from 'beantwortet' then
    new.answered_at = now();
  end if;
  return new;
end;
$$;

create trigger questions_set_answered_at
  before update on public.questions
  for each row execute function public.set_question_answered_at();

-- ---------------------------------------------------------------------------
-- notification_log: placeholder for the future email pipeline. Nothing here
-- sends an email yet -- it only records who WOULD be emailed and about what,
-- so the in-app toast has real data to work with today, and the row shape
-- already matches what a real sender will need later.
-- ---------------------------------------------------------------------------
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('question_asked', 'question_answered')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index notification_log_recipient_idx on public.notification_log (recipient_id);

alter table public.notification_log enable row level security;

create policy "notification_log: select own" on public.notification_log
  for select using (recipient_id = auth.uid());
-- No insert/update policy for regular users: only the trigger below (running
-- as the migration owner, which bypasses RLS) ever writes here.

create function public.notify_question_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_creator_id uuid;
begin
  select creator_id into v_creator_id from public.courses where id = new.course_id;

  if tg_op = 'INSERT' then
    -- TODO(real email pipeline): once an email provider (e.g. Resend) is
    -- wired up, replace/extend this with a call to a Supabase Edge Function
    -- (e.g. via the pg_net extension's net.http_post) that actually emails
    -- v_creator_id about the new question. Keep this log insert regardless,
    -- as an audit trail.
    insert into public.notification_log (recipient_id, type, payload)
    values (v_creator_id, 'question_asked', jsonb_build_object('question_id', new.id, 'course_id', new.course_id));
  elsif tg_op = 'UPDATE' and new.status = 'beantwortet' and old.status is distinct from 'beantwortet' then
    -- TODO(real email pipeline): same as above, but emailing new.asked_by
    -- that their question was answered.
    insert into public.notification_log (recipient_id, type, payload)
    values (new.asked_by, 'question_answered', jsonb_build_object('question_id', new.id, 'course_id', new.course_id));
  end if;
  return new;
end;
$$;

create trigger questions_notify
  after insert or update on public.questions
  for each row execute function public.notify_question_event();
