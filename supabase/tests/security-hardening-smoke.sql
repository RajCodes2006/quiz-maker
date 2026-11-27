-- Run with the Supabase SQL editor or psql. All test data is rolled back.
BEGIN;

DO $$
DECLARE
  v_key text := 'security-smoke:' || gen_random_uuid()::text;
BEGIN
  IF public.consume_api_rate_limit(v_key, 1, 60) IS NOT TRUE THEN
    RAISE EXCEPTION 'First rate-limit request should be allowed';
  END IF;

  IF public.consume_api_rate_limit(v_key, 1, 60) IS NOT FALSE THEN
    RAISE EXCEPTION 'Second request should be blocked at a limit of one';
  END IF;

  DELETE FROM private.api_rate_limits WHERE bucket_key = v_key;

  IF has_table_privilege('anon', 'public.quiz_attempts', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.quiz_attempts', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.questions', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.questions', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.question_answers', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.question_answers', 'TRUNCATE') THEN
    RAISE EXCEPTION 'An API role still has TRUNCATE permission';
  END IF;

  IF has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Auth trigger function is directly executable by a client role';
  END IF;

  IF has_function_privilege('anon', 'public.consume_api_rate_limit(text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consume_api_rate_limit(text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.consume_api_rate_limit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Rate-limit RPC grants are incorrect';
  END IF;

  IF has_table_privilege('anon', 'private.api_rate_limits', 'SELECT')
     OR has_table_privilege('authenticated', 'private.api_rate_limits', 'SELECT')
     OR has_table_privilege('service_role', 'private.api_rate_limits', 'SELECT') THEN
    RAISE EXCEPTION 'Rate-limit backing table is exposed';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.quiz_attempts', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.quiz_attempts', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.quiz_responses', 'INSERT') THEN
    RAISE EXCEPTION 'A required application permission was removed';
  END IF;

  IF has_table_privilege('authenticated', 'public.questions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.question_answers', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.questions', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.question_answers', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.questions', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.question_answers', 'SELECT') THEN
    RAISE EXCEPTION 'Question-bank access is not server-only';
  END IF;
END;
$$;

ROLLBACK;
