-- W3: the wizard's autosave used to fire 5+ sequential requests per save
-- (chapters upsert, chapters cleanup delete, chapters re-select, one
-- chapter_content upsert per chapter, one course_content upsert) from
-- syncCourseContent() in kf-supabase.js. On a real tab close the browser
-- aborts everything in flight except a single navigator.sendBeacon/fetch
-- keepalive request, so that multi-request save could never reliably land.
-- This collapses the whole thing into one request: security invoker, so it
-- runs with the caller's own privileges and every existing RLS policy on
-- chapters/chapter_content/course_content still applies exactly as it did
-- for the direct client upserts -- this is a batching change only, not a
-- privilege change.
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
  chapter_id uuid;
begin
  if chapter_count is null or chapter_count = 0 then
    return;
  end if;

  insert into public.chapters (course_id, position, title, subchapters)
  select p_course_id, (e->>'position')::int, e->>'title', e->>'subchapters'
  from jsonb_array_elements(p_chapters) as e
  on conflict (course_id, position) do update
    set title = excluded.title, subchapters = excluded.subchapters;

  -- Same as before: RLS only allows deleting a chapter that was never
  -- submitted (status='offen'), so this is a silent no-op, not an error,
  -- for any chapter with real review history.
  delete from public.chapters
  where course_id = p_course_id and position >= chapter_count;

  for elem in select * from jsonb_array_elements(p_chapters)
  loop
    select id into chapter_id from public.chapters
    where course_id = p_course_id and position = (elem->>'position')::int;
    if chapter_id is null then
      continue;
    end if;

    insert into public.chapter_content (chapter_id, type, content, updated_at) values
      (chapter_id, 'zusammenfassung', coalesce(elem->'zusammenfassung', '{}'::jsonb), now()),
      (chapter_id, 'karteikarten', jsonb_build_object('cards', coalesce(elem->'cards', '[]'::jsonb)), now()),
      (chapter_id, 'uebungen', jsonb_build_object('items', coalesce(elem->'uebungen', '[]'::jsonb)), now())
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

grant execute on function public.sync_course_content(uuid, jsonb, jsonb) to authenticated;
