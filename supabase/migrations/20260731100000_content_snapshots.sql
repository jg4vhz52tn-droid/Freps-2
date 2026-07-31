-- Vorher/Nachher-Vergleich bei erneuter Kapitel-Einreichung: friert den
-- chapter_content-Stand bei jeder (Wieder-)Einreichung als Runden-Snapshot
-- ein, damit ein Prüfer bei der nächsten Runde sieht, was sich seit seiner
-- letzten Anmerkung geändert hat (Wort-Diff, siehe Pruef-Dashboard.html).
-- Nur die per-Kapitel-Bausteine (zusammenfassung/karteikarten/uebungen)
-- werden gesnapshottet -- altklausuren/tutorien/zusatz/lernplan liegen in
-- course_content (kursweit, nicht kapitelweit) und sind hier bewusst außen
-- vor, analog dazu, dass sie schon heute nicht publish-blockierend sind.

create table public.chapter_content_snapshots (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  type text not null,
  round_no int not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (chapter_id, type, round_no)
);
create index chapter_content_snapshots_chapter_id_idx on public.chapter_content_snapshots (chapter_id);

alter table public.chapter_comments add column round_no int;

-- Runden-Zähler direkt am Kapitel, damit round_no beim Snapshot und beim
-- Kommentar-Insert konsistent aus derselben Quelle kommt.
alter table public.chapters add column current_round int not null default 1;

alter table public.chapter_content_snapshots enable row level security;

create policy "chapter_content_snapshots: select owner or reviewer" on public.chapter_content_snapshots
  for select using (public.owns_chapter(chapter_id) or public.is_reviewer());

-- Snapshot bei jeder (Wieder-)Einreichung, plus automatisches Aufräumen
-- alter Runden (nie mehr als die letzten 2 Runden nötig -- siehe
-- Pruef-Dashboard.html-Diff-Logik, die nur Runde current_round-1 braucht).
--
-- Trigger-Reihenfolge: läuft "before update on chapters" wie
-- chapters_status_transition und chapters_reopen_on_metadata_edit. Der Name
-- ist bewusst so gewählt, dass er alphabetisch NACH "chapters_status_..."
-- sortiert ("x" > "s"), damit new.status hier bereits von
-- enforce_chapter_status_transition() validiert ist -- gleiches Muster wie
-- chapters_reopen_on_metadata_edit, das bewusst VOR "chapters_status_..."
-- benannt ist (siehe 20260728220000_w5_reopen_and_lock.sql).
create or replace function public.snapshot_chapter_content_on_submit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'pruefung' and old.status is distinct from 'pruefung' then
    insert into public.chapter_content_snapshots (chapter_id, type, round_no, content)
    select cc.chapter_id, cc.type, new.current_round, cc.content
    from public.chapter_content cc
    where cc.chapter_id = new.id;

    delete from public.chapter_content_snapshots
    where chapter_id = new.id and round_no <= new.current_round - 2;

    new.current_round = new.current_round + 1;
  end if;
  return new;
end;
$$;

create trigger chapters_x_snapshot_after_submit
  before update on public.chapters
  for each row execute function public.snapshot_chapter_content_on_submit();
