-- Lets a reviewer comment be tied to a specific content baustein
-- (Zusammenfassung/Karteikarten/Übungsaufgaben/Altklausuren/Tutorien/
-- Zusatzmodule) instead of only the chapter as a whole. NULL means a
-- general, chapter-level comment (e.g. the automatic "resubmitted" note).
alter table public.chapter_comments
  add column content_type text
  check (content_type is null or content_type in (
    'zusammenfassung', 'karteikarten', 'uebungen', 'altklausuren', 'tutorien', 'zusatz'
  ));
