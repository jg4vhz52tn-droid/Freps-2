-- Kurs-Sicherungsdatei (Export/Import), nur für Admin: restore_course_backup()
-- legt aus einer zuvor exportierten JSON-Struktur (siehe kf-supabase.js
-- exportCourseBackup()) einen KOMPLETT NEUEN Kurs an -- nie ein Überschreiben
-- eines bestehenden Kurses.
--
-- Freigabestatus bleibt beim Import erhalten (ein vorher freigegebenes
-- Kapitel bleibt freigegeben, kein erneuter Prüfdurchlauf nötig). Das ist
-- hier nicht trivial: chapter_content_reopens_chapter (Migration
-- 20260719080000) setzt ein Kapitel automatisch von 'freigegeben' zurück auf
-- 'pruefung', sobald chapter_content für dieses Kapitel eingefügt/geändert
-- wird -- und diese Rück-Transition ('freigegeben' -> 'pruefung') ist für
-- einen Reviewer/Admin in enforce_chapter_status_transition gar nicht
-- erlaubt (raist eine Exception). Ein Kapitel, das laut Sicherung
-- 'freigegeben' sein soll, wird deshalb zunächst mit Status 'pruefung'
-- angelegt (chapter_content/Kommentare landen also VOR dem eigentlichen
-- Freigeben), und danach separat -- vom Client, nach dem Hochladen etwaiger
-- Karteikarten-Bilder -- auf 'freigegeben' aktualisiert. Diese letzte
-- Transition (pruefung -> freigegeben) ist für einen Reviewer/Admin ganz
-- regulär erlaubt, siehe enforce_chapter_status_transition.
--
-- courses.status wird dagegen direkt beim INSERT gesetzt (nicht per
-- nachträglichem UPDATE) -- die Status-Übergangsprüfung
-- (enforce_course_status_transition) läuft nur "before update", ein INSERT
-- durchläuft sie nicht, ein frisch angelegter Kurs kann also direkt als
-- z. B. 'live' beginnen, ohne die sonst nötige entwurf -> in_arbeit -> live
-- Kette real durchlaufen zu müssen.
create or replace function public.restore_course_backup(payload jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_course_id uuid;
  new_chapter_id uuid;
  hochschule_row_id uuid;
  sg_name text;
  sg_row_id uuid;
  ch jsonb;
  ch_target_status text;
  ch_insert_status text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can restore a course backup';
  end if;

  select id into hochschule_row_id from public.hochschulen where name = payload->'course'->>'hochschule';
  if hochschule_row_id is null then
    insert into public.hochschulen (name, status) values (payload->'course'->>'hochschule', 'aktiv')
    returning id into hochschule_row_id;
  end if;

  insert into public.courses (creator_id, hochschule_id, title, professor, semester, status)
  values (
    auth.uid(), hochschule_row_id,
    coalesce(nullif(payload->'course'->>'title', ''), 'Unbenannter Kurs'),
    nullif(payload->'course'->>'professor', ''),
    nullif(payload->'course'->>'semester', ''),
    case when (payload->'course'->>'status') in ('entwurf', 'in_arbeit', 'live')
      then payload->'course'->>'status' else 'entwurf' end
  )
  returning id into new_course_id;

  for sg_name in select jsonb_array_elements_text(coalesce(payload->'course'->'studiengaenge', '[]'::jsonb))
  loop
    select id into sg_row_id from public.studiengaenge where name = sg_name;
    if sg_row_id is null then
      insert into public.studiengaenge (name) values (sg_name) returning id into sg_row_id;
    end if;
    insert into public.course_studiengaenge (course_id, studiengang_id) values (new_course_id, sg_row_id)
      on conflict do nothing;
  end loop;

  for ch in select * from jsonb_array_elements(coalesce(payload->'chapters', '[]'::jsonb))
  loop
    ch_target_status := case when (ch->>'status') in ('offen', 'pruefung', 'freigegeben', 'ueberarbeitung')
      then ch->>'status' else 'offen' end;
    -- siehe Kommentar oben: 'freigegeben' wird bewusst erst nachträglich (vom
    -- Client) gesetzt, alle anderen Status direkt beim Anlegen.
    ch_insert_status := case when ch_target_status = 'freigegeben' then 'pruefung' else ch_target_status end;

    insert into public.chapters (course_id, position, title, subchapters, status, is_free_preview, current_round)
    values (
      new_course_id, (ch->>'position')::int, coalesce(ch->>'title', ''), nullif(ch->>'subchapters', ''),
      ch_insert_status, coalesce((ch->>'isFreePreview')::boolean, false), coalesce((ch->>'currentRound')::int, 1)
    )
    returning id into new_chapter_id;

    -- Karteikarten-Bilder kommen erst in Phase 2 (Client lädt sie hoch und
    -- trägt die neuen Storage-Pfade per Update nach) -- hier zunächst ohne
    -- frageBild/antwortBild, siehe restoreCourseBackup() in kf-supabase.js.
    insert into public.chapter_content (chapter_id, type, content) values
      (new_chapter_id, 'zusammenfassung', coalesce(ch->'content'->'zusammenfassung', '{}'::jsonb)),
      (new_chapter_id, 'karteikarten', jsonb_build_object('cards', coalesce(ch->'content'->'karteikarten', '[]'::jsonb))),
      (new_chapter_id, 'uebungen', jsonb_build_object('items', coalesce(ch->'content'->'uebungen', '[]'::jsonb)));

    insert into public.chapter_comments (chapter_id, author, role, text, content_type, sub_key, round_no, created_at)
    select
      new_chapter_id,
      coalesce(c->>'author', 'Prüfer'),
      case when (c->>'role') in ('pruefer', 'creator') then c->>'role' else 'pruefer' end,
      coalesce(c->>'text', ''),
      nullif(c->>'contentType', ''),
      nullif(c->>'subKey', ''),
      nullif(c->>'roundNo', '')::int,
      coalesce(nullif(c->>'createdAt', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(ch->'comments', '[]'::jsonb)) as c;
  end loop;

  insert into public.course_content (course_id, type, content) values
    (new_course_id, 'altklausuren', jsonb_build_object('items', coalesce(payload->'courseWideContent'->'altklausuren', '[]'::jsonb))),
    (new_course_id, 'tutorien', jsonb_build_object('items', coalesce(payload->'courseWideContent'->'tutorien', '[]'::jsonb))),
    (new_course_id, 'zusatz', coalesce(payload->'courseWideContent'->'zusatzmodule', '{}'::jsonb)),
    (new_course_id, 'lernplan', jsonb_build_object('items', coalesce(payload->'courseWideContent'->'lernplan', '[]'::jsonb)));

  return new_course_id;
end;
$$;

grant execute on function public.restore_course_backup(jsonb) to authenticated;
