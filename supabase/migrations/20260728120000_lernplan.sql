-- Lernplan: creator-authored study plan entries (relative day, task text,
-- optional reference to an existing baustein/chapter, estimated duration).
-- Stored as a course-wide course_content row (type 'lernplan'), same as
-- altklausuren/tutorien/zusatz -- informational for the reviewer, not a
-- publish-blocking gate (matches how those other course-wide bausteine
-- already behave; only the three per-chapter bausteine actually gate
-- publishing today).

-- Let a reviewer comment be tied to the Lernplan baustein too.
alter table public.chapter_comments drop constraint if exists chapter_comments_content_type_check;
alter table public.chapter_comments
  add constraint chapter_comments_content_type_check
  check (content_type is null or content_type in (
    'zusammenfassung', 'karteikarten', 'uebungen', 'altklausuren', 'tutorien', 'zusatz', 'lernplan'
  ));
