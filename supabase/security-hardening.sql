-- CU Quiz: production security hardening
-- Run after supabase/schema.sql in the Supabase SQL Editor.

-- Remove capabilities that app users and the application service account do not need.
-- RLS does not protect TRUNCATE, so this must be controlled through SQL privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public
FROM anon, authenticated, service_role;

-- Future objects created by the postgres schema owner should require explicit grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES
  FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- This is invoked by the auth.users trigger; direct API execution is not required.
REVOKE ALL ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;

-- Server-only API rate-limit buckets. Store hashes, never raw IPs or emails.
CREATE TABLE IF NOT EXISTS private.api_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);
CREATE INDEX IF NOT EXISTS api_rate_limits_window_started_idx
  ON private.api_rate_limits(window_started_at);
ALTER TABLE private.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.api_rate_limits
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_bucket_key IS NULL
     OR pg_catalog.length(p_bucket_key) < 8
     OR pg_catalog.length(p_bucket_key) > 180
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 10000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit parameters' USING errcode = '22023';
  END IF;

  INSERT INTO private.api_rate_limits AS current_bucket (
    bucket_key, window_started_at, request_count
  )
  VALUES (p_bucket_key, v_now, 1)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    window_started_at = CASE
      WHEN current_bucket.window_started_at <=
        v_now - pg_catalog.make_interval(secs => p_window_seconds)
      THEN v_now
      ELSE current_bucket.window_started_at
    END,
    request_count = CASE
      WHEN current_bucket.window_started_at <=
        v_now - pg_catalog.make_interval(secs => p_window_seconds)
      THEN 1
      ELSE current_bucket.request_count + 1
    END
  RETURNING request_count INTO v_count;

  -- Low-frequency cleanup prevents stale one-off identifiers accumulating forever.
  IF pg_catalog.random() < 0.02 THEN
    DELETE FROM private.api_rate_limits
    WHERE window_started_at < v_now - interval '2 days';
  END IF;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text, integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, integer, integer)
TO service_role;
