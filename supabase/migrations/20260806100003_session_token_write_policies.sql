-- Sicherheits-Audit 06.08.2026, Punkt 2, zweiter Teil (nachdem
-- claimDeviceSession() jetzt signOut({scope:'others'}) nutzt und ein
-- verdrängtes Gerät damit serverseitig wirklich abgemeldet wird, nicht nur
-- "unsichtbar für session_token_valid() bis zum nächsten Auto-Refresh"):
-- session_token_valid() bisher nur bei Status-Übergängen (Kapitel/Kurs) und
-- Profil-Updates geprüft, nicht bei den meisten Content-/Kauf-Schreibzugriffen.
-- Jetzt, wo ein verdrängtes Gerät sein Session wirklich verliert statt sich
-- selbst weiter zu erneuern, macht das Ausweiten hier tatsächlich einen
-- Unterschied (vorher hätte ein bald wieder "gültiges" Gerät die zusätzliche
-- Prüfung ohnehin binnen Kurzem wieder bestanden).
--
-- Jede betroffene Policy wird 1:1 neu angelegt, nur mit
-- "and session_token_valid()" ergänzt -- keine sonstige Logikänderung.

-- chapter_content
drop policy "chapter_content: write own chapter" on public.chapter_content;
create policy "chapter_content: write own chapter"
on public.chapter_content for insert
with check (owns_chapter(chapter_id) and public.session_token_valid());

drop policy "chapter_content: update own chapter" on public.chapter_content;
create policy "chapter_content: update own chapter"
on public.chapter_content for update
using (owns_chapter(chapter_id) and public.session_token_valid());

-- chapters (Status-Übergänge waren schon über die Trigger abgesichert --
-- das hier deckt zusätzlich reine Metadaten-Updates ohne Statuswechsel ab,
-- die bisher komplett ungeprüft blieben)
drop policy "chapters: insert own course" on public.chapters;
create policy "chapters: insert own course"
on public.chapters for insert
with check (owns_course(course_id) and public.session_token_valid());

drop policy "chapters: update own or reviewer" on public.chapters;
create policy "chapters: update own or reviewer"
on public.chapters for update
using ((owns_course(course_id) or is_reviewer()) and public.session_token_valid());

-- course_content
drop policy "course_content: insert own course" on public.course_content;
create policy "course_content: insert own course"
on public.course_content for insert
with check (owns_course(course_id) and public.session_token_valid());

drop policy "course_content: update own course" on public.course_content;
create policy "course_content: update own course"
on public.course_content for update
using (owns_course(course_id) and public.session_token_valid());

-- courses (Statuswechsel waren schon über enforce_course_status_transition
-- abgesichert -- das hier deckt zusätzlich reine Stammdaten-Updates ohne
-- Statuswechsel ab, z. B. Titel/Prof/Semester)
drop policy "courses: update own" on public.courses;
create policy "courses: update own"
on public.courses for update
using (creator_id = auth.uid() and public.session_token_valid());

drop policy "courses: reviewer update" on public.courses;
create policy "courses: reviewer update"
on public.courses for update
using (is_reviewer() and public.session_token_valid());

drop policy "courses: admin update all" on public.courses;
create policy "courses: admin update all"
on public.courses for update
using (is_admin() and public.session_token_valid())
with check (is_admin() and public.session_token_valid());

-- purchases (explizit im Audit genannt)
drop policy "purchases: insert own" on public.purchases;
create policy "purchases: insert own"
on public.purchases for insert
with check (user_id = auth.uid() and public.session_token_valid());

-- learning_progress
drop policy "learning_progress: insert own" on public.learning_progress;
create policy "learning_progress: insert own"
on public.learning_progress for insert
with check (user_id = auth.uid() and public.session_token_valid());

drop policy "learning_progress: update own" on public.learning_progress;
create policy "learning_progress: update own"
on public.learning_progress for update
using (user_id = auth.uid() and public.session_token_valid());

-- questions
drop policy "questions: insert own with access" on public.questions;
create policy "questions: insert own with access"
on public.questions for insert
with check (asked_by = auth.uid() and can_ask_question(course_id, chapter_id) and public.session_token_valid());

drop policy "questions: creator answers" on public.questions;
create policy "questions: creator answers"
on public.questions for update
using (owns_course(course_id) and public.session_token_valid());

-- chapter_comments (Rollen-Fix von vorhin, jetzt zusätzlich mit Session-Check)
drop policy "chapter_comments: insert owner or reviewer" on public.chapter_comments;
create policy "chapter_comments: insert owner or reviewer"
on public.chapter_comments for insert
with check (
  ((role = 'pruefer' and public.is_reviewer()) or (role = 'creator' and public.owns_chapter(chapter_id)))
  and public.session_token_valid()
);

-- course_bundles
drop policy "course_bundles: propose own course" on public.course_bundles;
create policy "course_bundles: propose own course"
on public.course_bundles for insert
with check (owns_course(course_id_a) and proposed_by = auth.uid() and public.session_token_valid());

drop policy "course_bundles: reviewer confirm" on public.course_bundles;
create policy "course_bundles: reviewer confirm"
on public.course_bundles for update
using (is_reviewer() and public.session_token_valid())
with check (is_reviewer() and public.session_token_valid());

drop policy "course_bundles: delete own pending or reviewer" on public.course_bundles;
create policy "course_bundles: delete own pending or reviewer"
on public.course_bundles for delete
using (
  ((owns_course(course_id_a) and status = 'vorgeschlagen') or is_reviewer())
  and public.session_token_valid()
);

-- course_studiengaenge (nur die Ownership-basierten Varianten -- die
-- admin-Varianten sind ohnehin schon is_admin()-gated)
drop policy "course_studiengaenge: write own course" on public.course_studiengaenge;
create policy "course_studiengaenge: write own course"
on public.course_studiengaenge for insert
with check (owns_course(course_id) and public.session_token_valid());

drop policy "course_studiengaenge: delete own course" on public.course_studiengaenge;
create policy "course_studiengaenge: delete own course"
on public.course_studiengaenge for delete
using (owns_course(course_id) and public.session_token_valid());

-- hochschulen / studiengaenge (Vorschlag-Insert von Punkt 3, jetzt zusätzlich
-- mit Session-Check)
drop policy "hochschulen: insert" on public.hochschulen;
create policy "hochschulen: insert"
on public.hochschulen for insert
with check (
  (public.is_reviewer() or (auth.uid() is not null and status = 'vorschlag'))
  and public.session_token_valid()
);

drop policy "studiengaenge: insert" on public.studiengaenge;
create policy "studiengaenge: insert"
on public.studiengaenge for insert
with check (
  (public.is_reviewer() or (auth.uid() is not null and status = 'vorschlag'))
  and public.session_token_valid()
);
