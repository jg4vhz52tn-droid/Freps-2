-- Konsistenz-Audit 07.08.2026, Punkt 4 (D4): approve()/requestChanges() in
-- kf-supabase.js machten erst das chapters-Status-Update, dann den
-- chapter_comments-Insert als zwei getrennte Requests -- schlug der zweite
-- Schritt fehl (z. B. Netzwerkfehler), blieb der Status schon geändert,
-- aber die Prüfer-Anmerkungen fehlten.
--
-- Fix: eine einzige Postgres-Funktion, die beides in EINER Transaktion
-- macht -- schlägt irgendein Schritt fehl, rollt Postgres die ganze
-- Funktion automatisch zurück (kein Status-Update ohne die zugehörigen
-- Kommentare, und umgekehrt).
--
-- "security invoker" (nicht definer): die Funktion läuft weiterhin mit den
-- Rechten des aufrufenden Prüfers, genau wie die bisherigen zwei
-- Einzel-Requests -- das UPDATE auf chapters durchläuft weiterhin
-- enforce_chapter_status_transition() (inkl. is_reviewer()- und
-- session_token_valid()-Check aus 20260806100003) und die
-- "chapters: update own or reviewer"-Policy, der INSERT auf
-- chapter_comments weiterhin die "chapter_comments: insert owner or
-- reviewer"-Policy (role='pruefer' erfordert is_reviewer()). Das hier ist
-- eine reine Bündelung/Atomizität, keine Rechteänderung.
create or replace function public.reviewer_decide_chapter(
  p_chapter_id uuid,
  p_new_status text,
  p_notes jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_round_no int;
  note jsonb;
begin
  if p_new_status not in ('freigegeben', 'ueberarbeitung') then
    raise exception 'invalid status for reviewer decision: %', p_new_status;
  end if;

  update public.chapters set status = p_new_status where id = p_chapter_id;
  if not found then
    raise exception 'chapter not found or not permitted';
  end if;

  -- current_round zeigt bereits auf die Runde, die die NÄCHSTE
  -- Wiedervorlage bekommt (wird vom Snapshot-Trigger schon beim Einreichen
  -- hochgezählt) -- die Runde, die der Prüfer gerade vor sich hat, ist
  -- also immer current_round - 1 (gleiche Logik wie zuvor in
  -- insertReviewerNotes()).
  select current_round - 1 into v_round_no from public.chapters where id = p_chapter_id;

  for note in select * from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb))
  loop
    if coalesce(trim(note->>'text'), '') = '' then
      continue;
    end if;
    insert into public.chapter_comments (chapter_id, author, role, text, content_type, sub_key, round_no)
    values (
      p_chapter_id, 'Prüfer', 'pruefer',
      trim(note->>'text'),
      nullif(note->>'content_type', ''),
      nullif(note->>'sub_key', ''),
      v_round_no
    );
  end loop;
end;
$$;

grant execute on function public.reviewer_decide_chapter(uuid, text, jsonb) to authenticated;
