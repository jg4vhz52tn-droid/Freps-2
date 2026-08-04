-- restore_course_backup() konnte an "duplicate key value violates unique
-- constraint courses_creator_title_unique" scheitern: dieser Constraint (aus
-- getOrCreateDraftCourse()'s upsert onConflict: "creator_id,title") erlaubt
-- keine zwei Kurse mit demselben Titel unter demselben creator_id -- und der
-- Admin, der eine Sicherung wiederherstellt, wird hier bewusst als
-- creator_id des neuen Kurses gesetzt (siehe Kommentar in der vorigen
-- Migration). Legt derselbe Admin-Account z. B. eine Sicherung des eigenen
-- Kurses an und importiert sie wieder (oder importiert dieselbe Datei
-- zweimal), kollidiert der identische Titel mit dem bereits vorhandenen
-- Kurs. Fix: Titel bei Bedarf automatisch mit "(wiederhergestellt)"
-- disambiguieren, statt den ganzen Import mit einem kryptischen DB-Fehler
-- abzubrechen.
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
  v_base_title text;
  v_title text;
  v_suffix int := 0;
begin
  if not public.is_admin() then
    raise exception 'only an admin can restore a course backup';
  end if;

  select id into hochschule_row_id from public.hochschulen where name = payload->'course'->>'hochschule';
  if hochschule_row_id is null then
    insert into public.hochschulen (name, status) values (payload->'course'->>'hochschule', 'aktiv')
    returning id into hochschule_row_id;
  end if;

  v_base_title := coalesce(nullif(payload->'course'->>'title', ''), 'Unbenannter Kurs');
  v_title := v_base_title;
  while exists (select 1 from public.courses where creator_id = auth.uid() and title = v_title) loop
    v_suffix := v_suffix + 1;
    v_title := v_base_title || ' (wiederhergestellt' || (case when v_suffix > 1 then ' ' || v_suffix else '' end) || ')';
  end loop;

  insert into public.courses (creator_id, hochschule_id, title, professor, semester, status)
  values (
    auth.uid(), hochschule_row_id, v_title,
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
    ch_insert_status := case when ch_target_status = 'freigegeben' then 'pruefung' else ch_target_status end;

    insert into public.chapters (course_id, position, title, subchapters, status, is_free_preview, current_round)
    values (
      new_course_id, (ch->>'position')::int, coalesce(ch->>'title', ''), nullif(ch->>'subchapters', ''),
      ch_insert_status, coalesce((ch->>'isFreePreview')::boolean, false), coalesce((ch->>'currentRound')::int, 1)
    )
    returning id into new_chapter_id;

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
