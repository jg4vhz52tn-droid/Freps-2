-- W7: the Lernplan baustein was fully wired up for creators (wizard step,
-- course_content, review comments -- 20260728120000_lernplan.sql already
-- extended chapter_comments' content_type check for it) but never for
-- learners: it's rendered nowhere in the purchased-course content view, and
-- the questions table's content_type check doesn't even allow 'lernplan'
-- yet, which the learner-side Tutorfragen widget needs.
alter table public.questions drop constraint if exists questions_content_type_check;
alter table public.questions
  add constraint questions_content_type_check
  check (content_type in (
    'zusammenfassung', 'karteikarten', 'uebungen', 'altklausuren', 'tutorien', 'zusatz', 'lernplan'
  ));

-- The second check in the original CREATE TABLE was an unnamed table-level
-- constraint (not tied to one column) -- Postgres auto-names the first one
-- of those "<table>_check", but drop every plausible auto-generated name
-- defensively rather than assume which one actually landed.
alter table public.questions drop constraint if exists questions_check;
alter table public.questions drop constraint if exists questions_check1;
alter table public.questions drop constraint if exists questions_chapter_id_check;
alter table public.questions
  add constraint questions_content_chapter_check
  check (
    (content_type in ('zusammenfassung', 'karteikarten', 'uebungen') and chapter_id is not null)
    or (content_type in ('altklausuren', 'tutorien', 'zusatz', 'lernplan') and chapter_id is null)
  );
