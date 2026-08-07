-- Fixes für Sicherheits-Audit vom 06.08.2026 (Punkte 1, 4, 5, 7 -- 2, 3, 6
-- bewusst ausgeklammert, siehe Rückmeldung an den Nutzer: das sind
-- Produktentscheidungen bzw. brauchen erst eine Rückfrage).

-- ---------------------------------------------------------------------------
-- 1. profiles.email gegen Client-Updates sperren (analog zu is_admin/
--    is_reviewer, siehe lock_is_admin_column()/lock_is_reviewer_column() in
--    20260729100000_admin_role.sql). profiles.role existiert bereits nicht
--    mehr -- wurde in 20260720170000_business_model.sql schon vollständig
--    durch is_creator ersetzt und die Spalte gedroppt, hier ist nichts mehr zu
--    tun. E-Mail wird ausschließlich einmalig von handle_new_user() (Trigger
--    auf auth.users) gesetzt; es gibt im Client keinen legitimen
--    "E-Mail ändern"-Weg, der hierdurch bricht.
-- ---------------------------------------------------------------------------
create or replace function public.lock_email_column()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'email cannot be changed via the client API';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_email
  before update on public.profiles
  for each row execute function public.lock_email_column();

-- ---------------------------------------------------------------------------
-- 4. courses.bundle_note / courses.transcript_path sind über
--    "courses: select visible" für jeden lesbaren (die Policy lässt
--    live/in_arbeit für alle sichtbar, RLS filtert nur Zeilen, keine
--    Spalten) -- transcript_path enthält die Creator-User-UUID im Pfad.
--    courses_public maskiert beide Spalten außer für Owner/Reviewer/Admin;
--    zusätzlich werden die Rohspalten per REVOKE für authenticated/anon
--    komplett gesperrt, damit auch ein direkt gebauter REST-Call sie nicht
--    mehr lesen kann (nur noch über diese View, mit korrekter
--    Zeilen+Spalten-Prüfung).
--
--    WICHTIG (live verifiziert): eine einfache View auf courses würde als
--    Owner (postgres) laufen und dabei ALLE Zeilen zurückgeben, unabhängig
--    von "courses: select visible" -- Tabellen-Owner umgehen RLS per Default
--    (relforcerowsecurity=false), das wurde mit einer echten Test-Zeile in
--    einer zurückgerollten Transaktion nachgewiesen. Die WHERE-Klausel unten
--    dupliziert deshalb absichtlich exakt das Prädikat aus
--    "courses: select visible" (20260719080000_review_workflow.sql). Ändert
--    sich diese Policy je wieder, MUSS diese WHERE-Klausel synchron
--    mitgeändert werden.
-- ---------------------------------------------------------------------------
create view public.courses_public
with (security_invoker = false) as
select
  id, hochschule_id, creator_id, title, professor, semester, status,
  created_at, updated_at, transcript_status,
  case when public.owns_course(id) or public.is_reviewer()
    then bundle_note else null end as bundle_note,
  case when public.owns_course(id) or public.is_reviewer()
    then transcript_path else null end as transcript_path
from public.courses
where status in ('live', 'in_arbeit') or creator_id = auth.uid() or public.is_reviewer();

grant select on public.courses_public to authenticated, anon;

revoke select (bundle_note, transcript_path) on public.courses from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. chapter_comments: ein Kapitel-Owner (Creator) konnte bisher role/author
--    frei wählen und sich damit selbst Pseudo-Prüferkommentare
--    (role='pruefer') schreiben. Jetzt: role='pruefer' nur mit is_reviewer(),
--    role='creator' nur mit owns_chapter() -- ein Admin, der zufällig auch
--    Owner ist, darf weiterhin beides (beide Bedingungen können unabhängig
--    zutreffen), das ist gewollt und ändert nichts am bisherigen Verhalten
--    für den Normalfall (Creator kommentiert als 'creator',
--    insertReviewerNotes() kommentiert immer als 'pruefer').
-- ---------------------------------------------------------------------------
drop policy "chapter_comments: insert owner or reviewer" on public.chapter_comments;

create policy "chapter_comments: insert owner or reviewer"
on public.chapter_comments for insert
with check (
  (role = 'pruefer' and public.is_reviewer())
  or (role = 'creator' and public.owns_chapter(chapter_id))
);

-- ---------------------------------------------------------------------------
-- 7. Ein reiner Prüfer (is_reviewer=true, is_admin=false) bekam den
--    "creator:profiles(email)"-Join in getSubmissions()/getRecentCourses()
--    (kf-supabase.js) als null zurück, weil profiles bisher nur "select own"
--    und "admin select all" erlaubte. Reviewer dürfen ohnehin schon jeden
--    Kurs/jedes Kapitel sehen (is_reviewer()-Kaskade auf courses/chapters) --
--    diese Policy zieht das konsequent auf profiles nach: ein Reviewer darf
--    das Profil eines Nutzers sehen, der Creator eines beliebigen Kurses ist.
-- ---------------------------------------------------------------------------
create policy "profiles: reviewer select course creators"
on public.profiles for select
using (
  public.is_reviewer()
  and exists (select 1 from public.courses c where c.creator_id = profiles.id)
);
