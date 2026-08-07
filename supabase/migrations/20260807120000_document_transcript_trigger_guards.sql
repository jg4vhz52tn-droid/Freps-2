-- Konsistenz-Audit 07.08.2026, Punkt 5 (D5): die im Audit angenommene
-- Abhängigkeit ("courses_sync_transcript_status muss alphabetisch VOR
-- courses_transcript_status_transition feuern, sonst bricht die
-- Absicherung") wurde vor dem Dokumentieren geprüft, statt sie zu
-- übernehmen -- laut Anweisung "bei Unklarheiten erst berichten, nicht
-- raten".
--
-- Ergebnis: die Abhängigkeit besteht beim aktuellen Code NICHT. Beide
-- Trigger sind durch ihre eigenen Guard-Bedingungen bereits gegenseitig
-- ausschließend konstruiert:
--   * sync_transcript_status_on_path_change() wirkt NUR, wenn sich
--     transcript_path ändert.
--   * enforce_transcript_status_transition() prüft NUR, wenn sich
--     transcript_status ändert UND transcript_path sich NICHT ändert
--     ("new.transcript_path is not distinct from old.transcript_path").
-- Ein einzelnes UPDATE kann also nie beide Zweige zugleich sinnvoll
-- auslösen -- unabhängig davon, welcher der beiden Trigger zuerst feuert,
-- kommt am Ende derselbe new.transcript_status heraus. Live bestätigt
-- (reversible Transaktion): ein UPDATE, das transcript_path UND
-- transcript_status gleichzeitig ändert (versuchter Selbst-Freigabe-Bypass
-- durch einen Creator beim Re-Upload), ergibt in jedem Fall
-- transcript_status = 'ausstehend', nie den vom Aufrufer übergebenen Wert.
-- Zusätzlich bestätigt durch Durchsicht aller echten Schreibzugriffe in
-- kf-supabase.js: uploadTranscript() (Zeile ~1127) setzt ausschließlich
-- transcript_path, die Reviewer-Entscheidung (Zeile ~1164) ausschließlich
-- transcript_status -- kein Code-Pfad schreibt aktuell beide Spalten in
-- einem einzigen Request.
--
-- Die Robustheit kommt also nicht von der Trigger-Reihenfolge, sondern von
-- der "and new.transcript_path is not distinct from old.transcript_path"-
-- Bedingung in enforce_transcript_status_transition(). Genau das ist unten
-- als dauerhafter COMMENT ON FUNCTION festgehalten (übersteht anders als
-- ein reiner Migrations-Kommentar auch ein Nachschlagen direkt im Schema,
-- z. B. via \df+ in psql) -- fällt diese Bedingung künftig weg, wird die
-- Reihenfolge auf einmal ECHT sicherheitsrelevant, und genau darauf weisen
-- beide Kommentare hin.

comment on function public.sync_transcript_status_on_path_change() is
  'Wirkt NUR wenn sich courses.transcript_path aendert (setzt transcript_status dann zwingend auf ausstehend/null). '
  'Durch dieses Guard und das komplementaere Guard in enforce_transcript_status_transition() '
  '(das NUR wirkt wenn sich transcript_path NICHT aendert) sind beide before-update-Trigger auf courses '
  'gegenseitig ausschliessend -- die alphabetische Feuerreihenfolge relativ zu courses_transcript_status_transition '
  'ist deshalb aktuell UNERHEBLICH (siehe Migration 20260807120000). Wird eines der beiden transcript_path-Guards '
  'jemals entfernt/geaendert, bitte die Reihenfolge (Trigger-Name "sync" < "transition" alphabetisch) neu pruefen.';

comment on function public.enforce_transcript_status_transition() is
  'Wirkt NUR wenn sich courses.transcript_status aendert UND transcript_path NICHT (das "and new.transcript_path '
  'is not distinct from old.transcript_path" unten ist der eigentliche Sicherheitsmechanismus, nicht die '
  'Trigger-Reihenfolge). Siehe Kommentar an sync_transcript_status_on_path_change() und Migration 20260807120000.';

-- Eingebetteter Regressionstest (kein separates Test-Framework in diesem
-- Projekt vorhanden -- läuft daher einmalig beim Anwenden dieser Migration,
-- räumt sich danach selbst auf): simuliert genau den Fall, der bei einem
-- Wegfall der Guard-Bedingung gefährlich würde -- transcript_path UND
-- transcript_status gleichzeitig in einem UPDATE geändert. Muss immer
-- 'ausstehend' ergeben, nie den übergebenen 'angenommen'-Wert.
do $$
declare
  v_course_id uuid;
  v_result text;
begin
  insert into public.courses (creator_id, hochschule_id, title, professor, semester, status)
  select id, (select id from public.hochschulen limit 1), 'D5-TRIGGER-GUARD-CHECK', 'Prof', 'WS25', 'entwurf'
  from public.profiles limit 1
  returning id into v_course_id;

  update public.courses
    set transcript_path = 'test/path.pdf', transcript_status = 'angenommen'
    where id = v_course_id;

  select transcript_status into v_result from public.courses where id = v_course_id;

  delete from public.courses where id = v_course_id;

  if v_result is distinct from 'ausstehend' then
    raise exception 'D5-CHECK FAILED: gleichzeitige Aenderung von transcript_path + transcript_status ergab "%" statt "ausstehend" -- die Guard-Unabhaengigkeit ist nicht mehr gegeben, Trigger-Reihenfolge jetzt bitte pruefen!', v_result;
  end if;

  raise notice 'D5-CHECK PASSED: transcript_status wird bei gleichzeitiger Pfad-Aenderung immer auf ausstehend normalisiert, unabhaengig von der Trigger-Reihenfolge.';
end $$;
