-- Sicherheits-Audit 06.08.2026, Punkt 3: "hochschulen: authenticated insert" /
-- "studiengaenge: authenticated insert" erlaubten jedem eingeloggten Nutzer,
-- direkt eine neue Zeile anzulegen (Grundlage der Phantom-Hochschulen aus
-- Bug 2 vom 05.08.). Fix (mit Kris/Nutzer abgestimmt: Reviewer-Freigabe statt
-- nur serverseitiger Normalisierung): ein Creator kann eine neue Hochschule/
-- einen neuen Studiengang weiterhin selbst anlegen, aber nur noch mit
-- status='vorschlag' -- unsichtbar in der öffentlichen Hochschulauswahl bzw.
-- der Admin-Studiengang-Auswahl, bis ein Reviewer sie im Prüf-Dashboard
-- freigibt (status -> 'aktiv', erlaubt bereits über die bestehenden
-- "hochschulen: reviewer update"/"studiengaenge: reviewer update"-Policies).
-- Ein Reviewer/Admin kann weiterhin direkt mit jedem Status anlegen (z. B.
-- der bestehende Admin-Bearbeiten-Dialog).

alter table public.hochschulen drop constraint hochschulen_status_check;
alter table public.hochschulen add constraint hochschulen_status_check
  check (status in ('aktiv', 'bald', 'vorschlag'));

alter table public.studiengaenge add column status text not null default 'aktiv'
  check (status in ('aktiv', 'vorschlag'));

drop policy "hochschulen: authenticated insert" on public.hochschulen;
create policy "hochschulen: insert"
on public.hochschulen for insert
with check (
  public.is_reviewer() or (auth.uid() is not null and status = 'vorschlag')
);

drop policy "studiengaenge: authenticated insert" on public.studiengaenge;
create policy "studiengaenge: insert"
on public.studiengaenge for insert
with check (
  public.is_reviewer() or (auth.uid() is not null and status = 'vorschlag')
);
