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


-- ---------------------------------------------------------------------------
-- Hardening: atomic question writes and single-use, server-issued quiz sessions
-- ---------------------------------------------------------------------------

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  question_ids uuid[] not null,
  question_count integer not null check (question_count in (10, 20, 40, 80)),
  answer_tokens jsonb not null,
  option_labels jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz
);

create index if not exists quiz_sessions_user_created_idx
  on public.quiz_sessions(user_id, created_at desc);

alter table public.quiz_sessions enable row level security;
revoke all on public.quiz_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.quiz_sessions to service_role;
-- The session generator reads the same question pool used by student quiz pages.
grant select on public.subjects, public.questions to service_role;

-- Single-question admin creation is a single transaction.
create or replace function public.create_question_with_answer(
  p_subject_id uuid,
  p_question_text text,
  p_option_a text,
  p_option_b text,
  p_option_c text,
  p_option_d text,
  p_correct_option text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_question_id uuid;
begin
  if p_question_text is null or pg_catalog.length(pg_catalog.btrim(p_question_text)) < 5
     or p_option_a is null or pg_catalog.btrim(p_option_a) = ''
     or p_option_b is null or pg_catalog.btrim(p_option_b) = ''
     or p_option_c is null or pg_catalog.btrim(p_option_c) = ''
     or p_option_d is null or pg_catalog.btrim(p_option_d) = ''
     or p_correct_option not in ('A','B','C','D') then
    raise exception 'Invalid question or answer data' using errcode = '22023';
  end if;

  insert into public.questions (
    subject_id, question_text, option_a, option_b, option_c, option_d, is_published
  ) values (
    p_subject_id, p_question_text, p_option_a, p_option_b, p_option_c, p_option_d, true
  )
  returning id into v_question_id;

  insert into public.question_answers(question_id, correct_option)
  values (v_question_id, p_correct_option);

  return v_question_id;
end;
$$;

revoke all on function public.create_question_with_answer(uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_question_with_answer(uuid,text,text,text,text,text,text) to authenticated;

-- Bulk question and key creation is atomic: the whole import commits or none of it does.
create or replace function public.import_questions_with_answers(
  p_subject_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_subject_id is null
     or p_rows is null
     or pg_catalog.jsonb_typeof(p_rows) <> 'array'
     or pg_catalog.jsonb_array_length(p_rows) < 1
     or pg_catalog.jsonb_array_length(p_rows) > 500 then
    raise exception 'Invalid import payload' using errcode = '22023';
  end if;

  with input_rows as (
    select
      (entry ->> 'id')::uuid as id,
      entry ->> 'question_text' as question_text,
      entry ->> 'option_a' as option_a,
      entry ->> 'option_b' as option_b,
      entry ->> 'option_c' as option_c,
      entry ->> 'option_d' as option_d,
      pg_catalog.upper(entry ->> 'correct_option') as correct_option
    from pg_catalog.jsonb_array_elements(p_rows) as entry
  ),
  inserted_questions as (
    insert into public.questions (
      id, subject_id, question_text, option_a, option_b, option_c, option_d, is_published
    )
    select
      id, p_subject_id, question_text, option_a, option_b, option_c, option_d, true
    from input_rows
    returning id
  )
  insert into public.question_answers(question_id, correct_option)
  select i.id, r.correct_option
  from inserted_questions i
  join input_rows r on r.id = i.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.import_questions_with_answers(uuid,jsonb) from public, anon;
grant execute on function public.import_questions_with_answers(uuid,jsonb) to authenticated;

-- Quiz questions and option tokens are generated only on the server.
-- Correct tokens are stored in a server-only table, never returned to the client.
create or replace function public.create_quiz_session(
  p_user_id uuid,
  p_subject_id uuid,
  p_question_count integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hour_count integer;
  v_day_count integer;
  v_last_created timestamptz;
  v_session_id uuid;
  v_question_ids uuid[];
  v_questions jsonb;
  v_answer_tokens jsonb;
  v_option_labels jsonb;
begin
  if p_user_id is null or p_subject_id is null
     or p_question_count not in (10,20,40,80) then
    raise exception 'Invalid quiz request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select count(*) into v_hour_count
  from public.quiz_sessions
  where user_id = p_user_id and created_at > pg_catalog.now() - interval '1 hour';

  select count(*), max(created_at) into v_day_count, v_last_created
  from public.quiz_sessions
  where user_id = p_user_id and created_at > pg_catalog.now() - interval '24 hours';

  if v_hour_count >= 5 or v_day_count >= 15
     or (v_last_created is not null and v_last_created > pg_catalog.now() - interval '30 seconds') then
    raise exception 'Quiz start limit reached. Please wait before starting another quiz.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and is_active = true
  ) then
    raise exception 'Subject is inactive or unavailable' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.questions q
    join public.question_answers a on a.question_id = q.id
    where q.subject_id = p_subject_id and q.is_published = true
  ) < p_question_count then
    raise exception 'Not enough published questions with answer keys for this quiz size.'
      using errcode = 'P0001';
  end if;

  with picked as (
    select
      q.id, q.question_text,
      q.option_a, q.option_b, q.option_c, q.option_d,
      a.correct_option,
      pg_catalog.row_number() over (order by pg_catalog.random())::integer as question_order
    from public.questions q
    join public.question_answers a on a.question_id = q.id
    where q.subject_id = p_subject_id and q.is_published = true
    order by pg_catalog.random()
    limit p_question_count
  ),
  option_rows as (
    select
      p.id, p.question_text, p.question_order, p.correct_option,
      opt.source_key, opt.option_text,
      gen_random_uuid()::text as token,
      pg_catalog.row_number() over (
        partition by p.id order by pg_catalog.random()
      )::integer as option_position
    from picked p
    cross join lateral (
      values
        ('A'::text, p.option_a),
        ('B'::text, p.option_b),
        ('C'::text, p.option_c),
        ('D'::text, p.option_d)
    ) as opt(source_key, option_text)
  ),
  grouped as (
    select
      id, question_text, question_order,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'token', token,
          'label', case option_position
            when 1 then 'A' when 2 then 'B' when 3 then 'C' else 'D' end,
          'text', option_text
        ) order by option_position
      ) as options,
      pg_catalog.max(token) filter (where source_key = correct_option) as correct_token,
      pg_catalog.jsonb_object_agg(
        token,
        case option_position
          when 1 then 'A' when 2 then 'B' when 3 then 'C' else 'D' end
      ) as label_map
    from option_rows
    group by id, question_text, question_order
  )
  select
    pg_catalog.array_agg(id order by question_order),
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', id,
        'question_text', question_text,
        'options', options
      ) order by question_order
    ),
    pg_catalog.jsonb_object_agg(id::text, correct_token),
    pg_catalog.jsonb_object_agg(id::text, label_map)
  into v_question_ids, v_questions, v_answer_tokens, v_option_labels
  from grouped;

  if v_question_ids is null or pg_catalog.cardinality(v_question_ids) <> p_question_count then
    raise exception 'Could not generate a complete quiz. Please retry.' using errcode = 'P0001';
  end if;

  insert into public.quiz_sessions (
    user_id, subject_id, question_ids, question_count,
    answer_tokens, option_labels, expires_at
  ) values (
    p_user_id, p_subject_id, v_question_ids, p_question_count,
    v_answer_tokens, v_option_labels, pg_catalog.now() + interval '2 hours'
  )
  returning id into v_session_id;

  return pg_catalog.jsonb_build_object(
    'sessionId', v_session_id,
    'questions', v_questions
  );
end;
$$;

revoke all on function public.create_quiz_session(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.create_quiz_session(uuid,uuid,integer) to service_role;

-- A locked session can be submitted once, with exactly one valid option for every question.
create or replace function public.submit_quiz_session(
  p_user_id uuid,
  p_session_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.quiz_sessions%rowtype;
  v_question_id uuid;
  v_token text;
  v_correct_count integer := 0;
  v_attempt_id uuid;
  v_answer_count integer;
begin
  if p_user_id is null or p_session_id is null
     or p_answers is null or pg_catalog.jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Invalid quiz submission' using errcode = '22023';
  end if;

  select * into v_session
  from public.quiz_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Quiz session was not found' using errcode = 'P0001';
  end if;

  if v_session.submitted_at is not null then
    raise exception 'This quiz has already been submitted' using errcode = 'P0001';
  end if;

  if v_session.expires_at <= pg_catalog.now() then
    raise exception 'This quiz session has expired. Start a new quiz.' using errcode = 'P0001';
  end if;

  select count(*) into v_answer_count
  from pg_catalog.jsonb_object_keys(p_answers);

  if v_answer_count <> v_session.question_count then
    raise exception 'Answer every question before submitting' using errcode = '22023';
  end if;

  foreach v_question_id in array v_session.question_ids loop
    if not (p_answers ? v_question_id::text) then
      raise exception 'Answer every question before submitting' using errcode = '22023';
    end if;

    v_token := p_answers ->> v_question_id::text;
    if v_token is null
       or not ((v_session.option_labels -> v_question_id::text) ? v_token) then
      raise exception 'One or more selected options are invalid' using errcode = '22023';
    end if;

    if v_token = v_session.answer_tokens ->> v_question_id::text then
      v_correct_count := v_correct_count + 1;
    end if;
  end loop;

  insert into public.quiz_attempts (
    user_id, subject_id, total_questions, correct_count, score
  ) values (
    p_user_id, v_session.subject_id, v_session.question_count, v_correct_count, v_correct_count
  )
  returning id into v_attempt_id;

  insert into public.quiz_responses (
    attempt_id, question_id, selected_option, is_correct
  )
  select
    v_attempt_id,
    a.key::uuid,
    (v_session.option_labels -> a.key) ->> a.value,
    a.value = (v_session.answer_tokens ->> a.key)
  from pg_catalog.jsonb_each_text(p_answers) as a(key, value);

  update public.quiz_sessions
  set submitted_at = pg_catalog.now()
  where id = v_session.id;

  return pg_catalog.jsonb_build_object(
    'attemptId', v_attempt_id,
    'correctCount', v_correct_count,
    'totalQuestions', v_session.question_count
  );
end;
$$;

revoke all on function public.submit_quiz_session(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.submit_quiz_session(uuid,uuid,jsonb) to service_role;

