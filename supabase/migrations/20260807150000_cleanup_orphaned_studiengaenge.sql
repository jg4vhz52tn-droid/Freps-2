-- Konsistenz-Audit 07.08.2026, Punkt 3 (F3): wie schon bei den Phantom-
-- Hochschulen (Bug 2, 05.08.) sind 8 von 9 studiengaenge-Zeilen verwaist --
-- ohne referenzierenden Kurs -- darunter Import-Platzhalter wie
-- "BITTE ERGAENZEN" und "Betriebswirtschaftslehre (bitte pruefen/anpassen)",
-- die im Admin-Kursbearbeitungs-Dropdown (getAllStudiengaenge()) auftauchen.
--
-- Vor dieser Migration live geprüfte Trefferliste (course_count = Anzahl
-- referenzierender course_studiengaenge-Zeilen):
--   Betriebswirtschaft                              -- 0 Kurse -- wird gelöscht
--   Betriebswirtschaftslehre (bitte pruefen/anpassen) -- 0 Kurse -- wird gelöscht
--   BIM                                              -- 0 Kurse -- wird gelöscht
--   BITTE ERGAENZEN                                  -- 0 Kurse -- wird gelöscht
--   BNM                                              -- 0 Kurse -- wird gelöscht
--   International Management                        -- 4 Kurse -- BLEIBT
--   Marketing                                        -- 0 Kurse -- wird gelöscht
--   Wirtschaftsinformatik                            -- 0 Kurse -- wird gelöscht
--   Wirtschaftsingenieurwesen                        -- 0 Kurse -- wird gelöscht
--
-- course_studiengaenge.studiengang_id hat "on delete cascade" -- bei 0
-- referenzierenden Zeilen ist das hier ohnehin ein No-Op, aber die
-- explizite "name <> 'International Management'"-Bedingung bleibt zusätzlich
-- als zweite, unabhängige Absicherung stehen.
delete from public.studiengaenge s
where not exists (
  select 1 from public.course_studiengaenge cs where cs.studiengang_id = s.id
)
and s.name <> 'International Management';
