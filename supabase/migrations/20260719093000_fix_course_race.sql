-- Bugfix: getOrCreateDraftCourse() used select-then-insert to find/create a
-- creator's course by title, which races under concurrent saves (two calls
-- both see "no existing row" and both insert) -- this produced duplicate
-- course rows. A unique constraint lets the client use a single atomic
-- upsert instead. NULLs (seeded courses with no creator) never conflict with
-- each other or with real rows under a plain unique constraint, so this is
-- safe for the existing seed data.

-- Clean up the duplicate rows the race condition already produced (keep the
-- oldest row per creator_id+title; all extras here are untouched 'entwurf'
-- test rows with no submitted chapters).
delete from public.courses c
using (
  select id, row_number() over (
    partition by creator_id, title order by created_at
  ) as rn
  from public.courses
  where creator_id is not null
) ranked
where c.id = ranked.id and ranked.rn > 1;

alter table public.courses add constraint courses_creator_title_unique unique (creator_id, title);
