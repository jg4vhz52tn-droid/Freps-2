-- Seed data: mirrors the hard-coded demo content that used to live in
-- index.html's seedCourses array and Pruef-Dashboard.html's seedDemo(),
-- so the app isn't empty right after the migration.

insert into public.hochschulen (name, subtitle, status) values
  ('HWG Ludwigshafen', 'Hochschule für Wirtschaft und Gesellschaft', 'aktiv'),
  ('FH Frankfurt', 'Frankfurt University of Applied Sciences', 'bald');

insert into public.studiengaenge (name, aliases) values
  ('Betriebswirtschaft', '{}'),
  ('Wirtschaftsinformatik', '{}'),
  ('Wirtschaftsingenieurwesen', '{}');

-- courses (creator_id left null: seeded demo content has no real account behind it)
with h as (select id from public.hochschulen where name = 'HWG Ludwigshafen')
insert into public.courses (id, hochschule_id, title, professor, semester, status)
select gen_random_uuid(), h.id, v.title, v.professor, v.semester, 'live'
from h, (values
  ('Projektmanagement', 'Prof. Koch', '3. Semester'),
  ('Mathematik mit Statistik A', 'Prof. Weber', '1. Semester'),
  ('IFRS / Bilanzierung', 'Prof. Schmidt', '4. Semester'),
  ('Datenbanken', 'Prof. Wagner', '3. Semester'),
  ('Technische Mechanik', 'Prof. Hartung', '2. Semester')
) as v(title, professor, semester);

insert into public.course_studiengaenge (course_id, studiengang_id)
select c.id, s.id from public.courses c
join public.studiengaenge s on
  (c.title = 'Projektmanagement' and s.name in ('Betriebswirtschaft', 'Wirtschaftsinformatik', 'Wirtschaftsingenieurwesen'))
  or (c.title = 'Mathematik mit Statistik A' and s.name in ('Betriebswirtschaft', 'Wirtschaftsinformatik'))
  or (c.title = 'IFRS / Bilanzierung' and s.name in ('Wirtschaftsinformatik', 'Wirtschaftsingenieurwesen'))
  or (c.title = 'Datenbanken' and s.name = 'Wirtschaftsinformatik')
  or (c.title = 'Technische Mechanik' and s.name = 'Wirtschaftsingenieurwesen');

-- Projektmanagement: fully approved example chapters (matches the hard-coded
-- "bereits live" card that used to sit in renderMyCoursesCreator).
insert into public.chapters (course_id, position, title, status)
select c.id, v.position, v.title, 'freigegeben'
from public.courses c, (values
  (0, 'Kapitel 1 – Grundlagen'),
  (1, 'Kapitel 2 – Netzplantechnik'),
  (2, 'Kapitel 3 – Risiko & Kalkulation')
) as v(position, title)
where c.title = 'Projektmanagement';

-- Mathematik mit Statistik A / IFRS: chapters awaiting review, matching the
-- old demo submissions in Pruef-Dashboard.html's seedDemo().
insert into public.chapters (course_id, position, title, status)
select c.id, 0, 'Kapitel 1 – Deskriptive Statistik', 'pruefung'
from public.courses c where c.title = 'Mathematik mit Statistik A';

insert into public.chapters (course_id, position, title, status)
select c.id, 0, 'Kapitel 1 – Ansatz & Bewertung', 'pruefung'
from public.courses c where c.title = 'IFRS / Bilanzierung';

insert into public.chapter_content (chapter_id, type, content)
select ch.id, 'zusammenfassung', '{"text": "Lagemaße, Streuungsmaße, Häufigkeitsverteilungen"}'::jsonb
from public.chapters ch
join public.courses c on c.id = ch.course_id
where c.title = 'Mathematik mit Statistik A' and ch.position = 0;

insert into public.chapter_content (chapter_id, type, content)
select ch.id, 'zusammenfassung', '{"text": "Aktivierung, Erstbewertung, Folgebewertung nach IFRS"}'::jsonb
from public.chapters ch
join public.courses c on c.id = ch.course_id
where c.title = 'IFRS / Bilanzierung' and ch.position = 0;
