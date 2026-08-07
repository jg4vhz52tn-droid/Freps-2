-- Korrektur zu 20260806100000 (Punkt 4): die dortige
-- "revoke select (bundle_note, transcript_path) on courses from
-- authenticated, anon" griff NICHT -- live verifiziert: authenticated/anon
-- haben (Supabase-Standard) vollen TABELLEN-Level-SELECT auf courses
-- (pg_class.relacl zeigt "authenticated=arwdDxtm/postgres" usw.). Ein
-- Spalten-REVOKE kann einen bereits bestehenden Tabellen-weiten GRANT nicht
-- teilweise zurücknehmen -- Postgres prüft bei vorhandenem Tabellen-Grant
-- gar nicht erst die spaltenspezifische ACL. Ein direkter Testquery
-- (select bundle_note from courses ...) als simulierter fremder
-- authenticated-Nutzer bestätigte das: die Spalte war weiterhin lesbar.
--
-- Fix: den Tabellen-weiten SELECT für authenticated/anon vollständig
-- zurücknehmen und stattdessen nur noch für die ungefährlichen Spalten
-- (alles außer bundle_note/transcript_path) explizit neu erteilen.
-- courses_public bleibt unverändert die einzige Stelle, die die zwei
-- sensiblen Spalten (korrekt Owner/Reviewer-maskiert) zurückgibt -- die View
-- läuft weiterhin als Owner (postgres), der von diesem REVOKE nicht
-- betroffen ist.
revoke select on public.courses from authenticated, anon;

grant select (
  id, hochschule_id, creator_id, title, professor, semester, status,
  created_at, updated_at, transcript_status
) on public.courses to authenticated, anon;
