-- Fix: sync_course_content()'s local variable was named chapter_id, same as
-- the chapter_content.chapter_id column it inserts into -- Postgres can't
-- tell them apart inside the INSERT ... VALUES (chapter_id, ...) statement
-- ("column reference \"chapter_id\" is ambiguous", 42702), caught by a live
-- test call right after the previous migration.
create or replace function public.sync_course_content(
  p_course_id uuid,
  p_chapters jsonb,
  p_course_content jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  chapter_count int := jsonb_array_length(p_chapters);
  elem jsonb;
  v_chapter_id uuid;
begin
  if chapter_count is null or chapter_count = 0 then
    return;
  end if;

  insert into public.chapters (course_id, position, title, subchapters)
  select p_course_id, (e->>'position')::int, e->>'title', e->>'subchapters'
  from jsonb_array_elements(p_chapters) as e
  on conflict (course_id, position) do update
    set title = excluded.title, subchapters = excluded.subchapters;

  delete from public.chapters
  where course_id = p_course_id and position >= chapter_count;

  for elem in select * from jsonb_array_elements(p_chapters)
  loop
    select id into v_chapter_id from public.chapters
    where course_id = p_course_id and position = (elem->>'position')::int;
    if v_chapter_id is null then
      continue;
    end if;

    insert into public.chapter_content (chapter_id, type, content, updated_at) values
      (v_chapter_id, 'zusammenfassung', coalesce(elem->'zusammenfassung', '{}'::jsonb), now()),
      (v_chapter_id, 'karteikarten', jsonb_build_object('cards', coalesce(elem->'cards', '[]'::jsonb)), now()),
      (v_chapter_id, 'uebungen', jsonb_build_object('items', coalesce(elem->'uebungen', '[]'::jsonb)), now())
    on conflict (chapter_id, type) do update
      set content = excluded.content, updated_at = excluded.updated_at;
  end loop;

  insert into public.course_content (course_id, type, content, updated_at) values
    (p_course_id, 'altklausuren', coalesce(p_course_content->'altklausuren', '{}'::jsonb), now()),
    (p_course_id, 'tutorien', coalesce(p_course_content->'tutorien', '{}'::jsonb), now()),
    (p_course_id, 'zusatz', coalesce(p_course_content->'zusatz', '{}'::jsonb), now()),
    (p_course_id, 'lernplan', coalesce(p_course_content->'lernplan', '{}'::jsonb), now())
  on conflict (course_id, type) do update
    set content = excluded.content, updated_at = excluded.updated_at;
end;
$$;
