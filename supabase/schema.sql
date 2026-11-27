-- CU Quiz Platform: Supabase database schema
-- Run this file in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- Correct answers are deliberately stored separately from student-readable questions.
create table if not exists public.question_answers (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_option text not null check (correct_option in ('A', 'B', 'C', 'D')),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id),
  total_questions integer not null check (total_questions > 0),
  correct_count integer not null check (correct_count >= 0 and correct_count <= total_questions),
  score integer not null default 0,
  completed_at timestamptz not null default now()
);

create table if not exists public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  selected_option text check (selected_option in ('A', 'B', 'C', 'D')),
  is_correct boolean not null default false,
  unique (attempt_id, question_id)
);

create index if not exists questions_subject_published_idx
  on public.questions(subject_id, is_published);
create index if not exists attempts_user_completed_idx
  on public.quiz_attempts(user_id, completed_at desc);
create index if not exists responses_attempt_idx
  on public.quiz_responses(attempt_id);

-- A non-exposed helper schema avoids recursive profile RLS policies.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- Create a student profile for every new Auth user. Role is never taken from user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.questions enable row level security;
alter table public.question_answers enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_responses enable row level security;

-- Explicit grants are required for access through the Supabase Data API.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.question_answers to authenticated;
grant select on public.quiz_attempts to authenticated;
grant select on public.quiz_responses to authenticated;

-- Profiles: users can read their own profile; admins can read all profiles.
drop policy if exists "Profiles are readable by owner or admin" on public.profiles;
create policy "Profiles are readable by owner or admin"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()));

drop policy if exists "Users can update their own name" on public.profiles;
create policy "Users can update their own name"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Subjects: students see active subjects; admins manage all subjects.
drop policy if exists "Active subjects are readable" on public.subjects;
create policy "Active subjects are readable"
  on public.subjects for select to authenticated
  using (is_active or (select private.is_admin()));

drop policy if exists "Admins manage subjects" on public.subjects;
create policy "Admins manage subjects"
  on public.subjects for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Questions: students see published questions; admins manage all questions.
drop policy if exists "Published questions are readable" on public.questions;
create policy "Published questions are readable"
  on public.questions for select to authenticated
  using (is_published or (select private.is_admin()));

drop policy if exists "Admins manage questions" on public.questions;
create policy "Admins manage questions"
  on public.questions for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Only admins can access answer keys. Student scoring runs in a server-only API route.
drop policy if exists "Admins manage answer keys" on public.question_answers;
create policy "Admins manage answer keys"
  on public.question_answers for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Students can read only their own attempts and responses.
drop policy if exists "Users read own attempts" on public.quiz_attempts;
create policy "Users read own attempts"
  on public.quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Users read own responses" on public.quiz_responses;
create policy "Users read own responses"
  on public.quiz_responses for select to authenticated
  using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = attempt_id
        and (a.user_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

-- No client-side INSERT/UPDATE policies exist for attempts or responses.
-- The server route writes them after verifying the signed-in user.

-- To promote the first administrator, sign up normally, then run this as the project owner:
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'your-admin-email@example.com');
