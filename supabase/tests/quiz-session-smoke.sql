-- Run with the Supabase SQL Editor. The enclosing transaction is rolled back.
-- Requires at least one student profile and one active subject.
begin;

do $quiz_session_test$
declare
  v_user_id uuid;
  v_subject_id uuid;
  v_session jsonb;
  v_answers jsonb := '{}'::jsonb;
  v_question jsonb;
  v_answer_count integer;
  v_result jsonb;
  v_rejected boolean := false;
  v_saved_selections bigint;
  v_attempt_id uuid;
  v_attempt_count bigint;
  v_seed_index integer;
  v_seed_attempt_id uuid;
  v_oldest_seed_attempt_id uuid;
  v_test_question_id uuid;
begin
  select id into v_user_id
  from public.profiles
  where role = 'student'
  order by created_at
  limit 1;

  select id into v_subject_id
  from public.subjects
  where is_active = true
  order by created_at
  limit 1;

  if v_user_id is null or v_subject_id is null then
    raise exception 'Test requires a student profile and active subject';
  end if;

  select id into v_test_question_id
  from public.questions
  where subject_id = v_subject_id and is_published = true
  order by id
  limit 1;

  if v_test_question_id is null then
    raise exception 'Test requires at least one published question';
  end if;

  -- Seed six old attempts inside this rollback-only test transaction.
  for v_seed_index in 1..6 loop
    insert into public.quiz_attempts (
      user_id, subject_id, total_questions, correct_count, score, completed_at
    ) values (
      v_user_id,
      v_subject_id,
      10,
      0,
      0,
      pg_catalog.now() - pg_catalog.make_interval(days => 365 + v_seed_index)
    )
    returning id into v_seed_attempt_id;

    if v_seed_index = 6 then
      v_oldest_seed_attempt_id := v_seed_attempt_id;
    end if;
  end loop;

  insert into public.quiz_responses (
    attempt_id, question_id, selected_option, selected_option_text, is_correct
  ) values (
    v_oldest_seed_attempt_id, v_test_question_id, 'A', 'Retention test option', false
  );

  v_session := public.create_quiz_session(v_user_id, v_subject_id, 10);

  if pg_catalog.jsonb_array_length(v_session -> 'questions') <> 10 then
    raise exception 'Quiz session did not return exactly 10 questions';
  end if;

  if v_session::text like '%correct_option%' or v_session::text like '%answer_tokens%' then
    raise exception 'Quiz session response contains a server-only answer field';
  end if;

  for v_question in
    select value from pg_catalog.jsonb_array_elements(v_session -> 'questions')
  loop
    if pg_catalog.jsonb_array_length(v_question -> 'options') <> 4 then
      raise exception 'A question does not have exactly four options';
    end if;

    v_answers := v_answers || pg_catalog.jsonb_build_object(
      v_question ->> 'id',
      v_question -> 'options' -> 0 ->> 'token'
    );
  end loop;

  select count(*) into v_answer_count
  from pg_catalog.jsonb_object_keys(v_answers);

  if v_answer_count <> 10 then
    raise exception 'Could not construct all test answers';
  end if;

  -- Incomplete submissions must fail without creating an attempt.
  begin
    perform public.submit_quiz_session(
      v_user_id,
      (v_session ->> 'sessionId')::uuid,
      v_answers - (select v_question ->> 'id'
                   from pg_catalog.jsonb_array_elements(v_session -> 'questions') q(v_question)
                   limit 1)
    );
  exception when others then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'An incomplete submission was accepted';
  end if;

  v_result := public.submit_quiz_session(
    v_user_id,
    (v_session ->> 'sessionId')::uuid,
    v_answers
  );

  if (v_result ->> 'totalQuestions')::integer <> 10 then
    raise exception 'Quiz result has an invalid question count';
  end if;

  v_attempt_id := (v_result ->> 'attemptId')::uuid;
  select count(*) into v_saved_selections
  from public.quiz_responses
  where attempt_id = v_attempt_id
    and selected_option_text is not null;

  if v_saved_selections <> 10 then
    raise exception 'Selected option text was not saved for every answer';
  end if;

  v_rejected := false;
  begin
    perform public.submit_quiz_session(
      v_user_id,
      (v_session ->> 'sessionId')::uuid,
      v_answers
    );
  exception when others then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'The same quiz session was accepted twice';
  end if;

  select count(*) into v_attempt_count
  from public.quiz_attempts
  where user_id = v_user_id;

  if v_attempt_count <> 5 then
    raise exception 'Attempt retention failed: expected exactly five attempts, found %', v_attempt_count;
  end if;

  if exists (
    select 1 from public.quiz_attempts where id = v_oldest_seed_attempt_id
  ) then
    raise exception 'The oldest attempt was not removed';
  end if;

  if exists (
    select 1 from public.quiz_responses where attempt_id = v_oldest_seed_attempt_id
  ) then
    raise exception 'Responses belonging to the removed attempt were not deleted';
  end if;
end;
$quiz_session_test$;

rollback;
