CREATE TABLE public.ip_rate_limits (
  ip_hash text NOT NULL,
  window_kind text NOT NULL CHECK (window_kind IN ('day','burst')),
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, window_kind, window_start)
);

GRANT ALL ON public.ip_rate_limits TO service_role;
ALTER TABLE public.ip_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_ip_check(
  _ip_hash text,
  _daily_limit integer,
  _burst_limit integer
)
RETURNS TABLE (allowed boolean, reason text, daily_used integer, burst_used integer, resets_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  burst_start timestamptz := to_timestamp(floor(extract(epoch FROM now()) / 600) * 600);
  d_count integer;
  b_count integer;
BEGIN
  IF _ip_hash IS NULL OR length(_ip_hash) < 16 THEN
    RETURN QUERY SELECT false, 'invalid_key'::text, 0, 0, now();
    RETURN;
  END IF;

  DELETE FROM public.ip_rate_limits
   WHERE (window_kind = 'burst' AND window_start < now() - interval '30 minutes')
      OR (window_kind = 'day' AND window_start < now() - interval '2 days');

  INSERT INTO public.ip_rate_limits AS r (ip_hash, window_kind, window_start, count)
  VALUES (_ip_hash, 'day', day_start, 1)
  ON CONFLICT (ip_hash, window_kind, window_start)
  DO UPDATE SET count = r.count + 1, updated_at = now()
  RETURNING r.count INTO d_count;

  IF d_count > _daily_limit THEN
    RETURN QUERY SELECT false, 'ip_daily'::text, d_count, 0, day_start + interval '1 day';
    RETURN;
  END IF;

  INSERT INTO public.ip_rate_limits AS r (ip_hash, window_kind, window_start, count)
  VALUES (_ip_hash, 'burst', burst_start, 1)
  ON CONFLICT (ip_hash, window_kind, window_start)
  DO UPDATE SET count = r.count + 1, updated_at = now()
  RETURNING r.count INTO b_count;

  IF b_count > _burst_limit THEN
    RETURN QUERY SELECT false, 'ip_burst'::text, d_count, b_count, burst_start + interval '10 minutes';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'ok'::text, d_count, b_count, day_start + interval '1 day';
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ip_check(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ip_check(text, integer, integer) TO service_role;