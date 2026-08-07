-- Konsistenz-Audit 07.08.2026, Punkt 2 (U2): die card-images-SELECT-Policy
-- deckte bisher nur Owner/Reviewer/Käufer ab -- ein Nichtkäufer/anonymer
-- Nutzer, der eine freigegebene Free-Preview-Kapitel-Karteikarte mit Bild
-- ansieht, konnte den Text lesen (chapter_content erlaubt das bereits seit
-- 20260720170000), aber das zugehörige Bild nicht laden.
--
-- card-images-Objektpfade kodieren nur <course_id>/<uuid>.<ext> (siehe
-- 20260727190000_card_images.sql), keine chapter_id -- die Policy kann
-- also nicht direkt "gehört dieses Bild zu einer Free-Preview-Kapitel"
-- prüfen. Stattdessen wird über chapter_content.content (type=
-- 'karteikarten') nachgeschlagen: frageBild/antwortBild speichern dort
-- exakt denselben Storage-Pfad, den uploadCardImage() zurückgibt (siehe
-- kf-supabase.js, syncCourseContent()/buildSyncPayload()) -- also kann ein
-- Objektname direkt mit den Karten eines Kapitels abgeglichen werden.
--
-- Bedingungen sind 1:1 von "chapter_content: select visible"
-- (20260720170000_business_model.sql) übernommen: Kapitel freigegeben,
-- is_free_preview, Kurs sichtbar (course_is_visible -- live oder eigener
-- Entwurf/Reviewer).
drop policy "card-images: select entitled" on storage.objects;
create policy "card-images: select entitled"
on storage.objects for select
using (
  bucket_id = 'card-images'
  and (
    public.owns_course(((storage.foldername(name))[1])::uuid)
    or public.is_reviewer()
    or public.has_purchased(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1
      from public.chapter_content cc
      join public.chapters c on c.id = cc.chapter_id
      where cc.type = 'karteikarten'
        and c.course_id = ((storage.foldername(name))[1])::uuid
        and c.is_free_preview
        and c.status = 'freigegeben'
        and public.course_is_visible(c.course_id)
        and exists (
          select 1 from jsonb_array_elements(cc.content->'cards') as card
          where card->>'frageBild' = name or card->>'antwortBild' = name
        )
    )
  )
);
