CREATE TABLE public.contact_rate_limits (
  ip_hash text PRIMARY KEY CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  last_seen_at timestamptz NOT NULL
);

CREATE INDEX contact_rate_limits_last_seen_at_idx
  ON public.contact_rate_limits (last_seen_at);

ALTER TABLE public.contact_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contact_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_contact_rate_limit(p_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start timestamptz;
  v_request_count integer;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid contact rate-limit key';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM statement_timestamp()) / 900) * 900
  );

  INSERT INTO public.contact_rate_limits AS current_limit (
    ip_hash,
    window_start,
    request_count,
    last_seen_at
  )
  VALUES (p_ip_hash, v_window_start, 1, statement_timestamp())
  ON CONFLICT (ip_hash) DO UPDATE
  SET
    window_start = EXCLUDED.window_start,
    request_count = CASE
      WHEN current_limit.window_start = EXCLUDED.window_start
        THEN current_limit.request_count + 1
      ELSE 1
    END,
    last_seen_at = EXCLUDED.last_seen_at
  WHERE current_limit.window_start <= EXCLUDED.window_start
  RETURNING request_count INTO v_request_count;

  WITH expired AS (
    SELECT ip_hash
    FROM public.contact_rate_limits
    WHERE last_seen_at < statement_timestamp() - interval '1 day'
    ORDER BY last_seen_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.contact_rate_limits AS limits
  USING expired
  WHERE limits.ip_hash = expired.ip_hash;

  RETURN v_request_count IS NOT NULL AND v_request_count <= 5;
END;
$$;

ALTER FUNCTION public.consume_contact_rate_limit(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.consume_contact_rate_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_contact_rate_limit(text) TO service_role;
