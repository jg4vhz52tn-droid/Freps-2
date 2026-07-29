-- Klausurfuchs core schema
-- Replaces the localStorage-based KFStore/KFCatalog mockups with real tables.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles (extends auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'lernender' check (role in ('lernender', 'creator')),
  is_reviewer boolean not null default false,
  active_session_token uuid,
  created_at timestamptz not null default now()
);

-- Creates a profiles row whenever a new auth.users row is inserted.
-- Role comes from the signUp options.data payload (defaults to 'lernender').
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'lernender')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Katalog: hochschulen / studiengaenge
-- ---------------------------------------------------------------------------
create table public.hochschulen (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  subtitle text,
  status text not null default 'aktiv' check (status in ('aktiv', 'bald')),
  created_at timestamptz not null default now()
);

create table public.studiengaenge (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  hochschule_id uuid not null references public.hochschulen (id) on delete restrict,
  creator_id uuid references public.profiles (id) on delete cascade,
  title text not null,
  professor text,
  semester text,
  status text not null default 'entwurf' check (status in ('entwurf', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_studiengaenge (
  course_id uuid not null references public.courses (id) on delete cascade,
  studiengang_id uuid not null references public.studiengaenge (id) on delete cascade,
  primary key (course_id, studiengang_id)
);

-- ---------------------------------------------------------------------------
-- chapters / chapter_content / chapter_comments
-- ---------------------------------------------------------------------------
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  position int not null,
  title text not null,
  status text not null default 'offen' check (status in ('offen', 'pruefung', 'freigegeben', 'ueberarbeitung')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, position)
);

create table public.chapter_content (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  type text not null,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (chapter_id, type)
);

create table public.chapter_comments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  author text not null,
  role text not null check (role in ('pruefer', 'creator')),
  text text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- purchases / learning_progress
-- ---------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table public.learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  item_type text not null,
  item_id text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, item_type, item_id)
);

-- ---------------------------------------------------------------------------
-- indexes for the lookups the app actually performs
-- ---------------------------------------------------------------------------
create index courses_hochschule_id_idx on public.courses (hochschule_id);
create index courses_creator_id_idx on public.courses (creator_id);
create index chapters_course_id_idx on public.chapters (course_id);
create index chapter_content_chapter_id_idx on public.chapter_content (chapter_id);
create index chapter_comments_chapter_id_idx on public.chapter_comments (chapter_id);
create index purchases_user_id_idx on public.purchases (user_id);
create index learning_progress_user_course_idx on public.learning_progress (user_id, course_id);
