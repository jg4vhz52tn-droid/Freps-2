-- Creator kann einen eigenen Kurs löschen, solange er noch nicht live ist --
-- analog zur bestehenden chapters-Delete-Policy, die nur ungeprüfte Inhalte
-- löschbar macht. Ein bereits veröffentlichter (ggf. gekaufter) Kurs bleibt
-- geschützt, damit ein einfacher Löschen-Klick nicht Käuferzugriff oder
-- Auszahlungshistorie zerstört; das Entfernen eines live-Kurses ist damit
-- bewusst ein Admin-Vorgang außerhalb dieser Policy.
--
-- Kaskaden für chapters/chapter_content/chapter_comments/course_content/
-- purchases/learning_progress bestehen bereits (on delete cascade in der
-- Basis-Schema-Migration) -- keine weiteren Schema-Änderungen nötig.
create policy "courses: delete own if not live" on public.courses
  for delete using (public.owns_course(id) and status <> 'live');
