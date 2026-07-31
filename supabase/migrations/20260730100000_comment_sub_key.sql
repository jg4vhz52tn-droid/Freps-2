-- Lets a reviewer comment be tied to a single entry within a baustein
-- (e.g. one subchapter, one flashcard, one exercise) instead of only the
-- baustein as a whole. NULL means the comment still applies to the whole
-- baustein (or, combined with a NULL content_type too, to the chapter as a
-- whole) -- existing rows and behavior are unaffected.
--
-- No check constraint on purpose: content_type's constraint above has had to
-- be widened every time a new baustein type shipped (see the lernplan
-- migration) -- sub_key's shape differs per baustein anyway (an array index
-- as a string, or one of the two fixed "merke"/"tipps" summary fields), so a
-- constraint here would just be more of the same churn for no real benefit.
alter table public.chapter_comments add column sub_key text;
comment on column public.chapter_comments.sub_key is
  'Optional reference to a single entry within a baustein (the entry''s index '
  'in that baustein''s content array, as a string, or "merke"/"tipps" for the '
  'two fixed Zusammenfassung fields). NULL = comment applies to the whole '
  'baustein (or chapter, if content_type is also NULL) -- prior behavior.';
