-- Konsistenz-Audit 07.08.2026, Punkt 1 (D1, kritisch): sync_course_content()
-- lief bisher "security invoker", d.h. das abschließende
-- "delete from chapters where position >= chapter_count" unterlag der Policy
-- "chapters: delete own if never submitted" (nur status='offen'). Entfernte
-- ein Creator im Wizard ein Kapitel, das schon einmal eingereicht war
-- (pruefung/freigegeben/ueberarbeitung), blieb die Zeile als stiller
-- "Geist" stehen -- ein pruefung-Rest blockiert all_chapters_approved() und
-- damit dauerhaft das Publishing, ein freigegeben-Rest bleibt für Käufer
-- sichtbar, obwohl der Creator es im Wizard gelöscht hat.
--
-- Fix: die Funktion läuft jetzt "security definer" und kann damit auch
-- bereits eingereichte Kapitel wirklich entfernen. Weil security definer
-- die RLS-Policies der Tabelle komplett umgeht, prüft die Funktion die
-- Berechtigung jetzt selbst am Anfang (owns_course + session_token_valid --
-- letzteres, damit ein verdrängtes Gerät hier nicht am
-- session_token-Schreibschutz aus 20260806100003 vorbeikommt). Alles
-- andere ist unverändert -- nur eine reine 1:1-Kopie von
-- 20260728200000 plus dem Autorisierungs-Check und security definer.
--
-- chapter_content, chapter_comments und chapter_content_snapshots
-- referenzieren chapters.id alle mit "on delete cascade" -- das Löschen des
-- Kapitels hier entfernt also automatisch auch dessen Inhalte, Prüfer-
-- Kommentare und Versions-Snapshots mit, ohne dass diese Tabellen hier
-- extra angefasst werden müssen.
create or replace function public.sync_course_content(
  p_course_id uuid,
  p_chapters jsonb,
  p_course_content jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  chapter_count int := jsonb_array_length(p_chapters);
  elem jsonb;
  v_chapter_id uuid;
begin
  if not (public.owns_course(p_course_id) and public.session_token_valid()) then
    raise exception 'not authorized';
  end if;

  if chapter_count is null or chapter_count = 0 then
    return;
  end if;

  insert into public.chapters (course_id, position, title, subchapters)
  select p_course_id, (e->>'position')::int, e->>'title', e->>'subchapters'
  from jsonb_array_elements(p_chapters) as e
  on conflict (course_id, position) do update
    set title = excluded.title, subchapters = excluded.subchapters;

  -- Jetzt ohne RLS-Bremse: löscht auch pruefung/freigegeben/ueberarbeitung.
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
