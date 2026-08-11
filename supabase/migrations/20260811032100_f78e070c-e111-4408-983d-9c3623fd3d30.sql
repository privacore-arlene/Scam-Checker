CREATE TABLE public.daily_check_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Vancouver')::date,
  check_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (device_id, usage_date)
);

GRANT ALL ON public.daily_check_usage TO service_role;

ALTER TABLE public.daily_check_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_daily_check_usage_updated_at
BEFORE UPDATE ON public.daily_check_usage
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.consume_daily_check(_device_id text, _limit integer)
RETURNS TABLE (allowed boolean, used integer, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'America/Vancouver')::date;
  _count integer;
BEGIN
  INSERT INTO public.daily_check_usage (device_id, usage_date, check_count)
  VALUES (_device_id, _today, 0)
  ON CONFLICT (device_id, usage_date) DO NOTHING;

  SELECT check_count INTO _count
  FROM public.daily_check_usage
  WHERE device_id = _device_id AND usage_date = _today
  FOR UPDATE;

  IF _count >= _limit THEN
    RETURN QUERY SELECT false, _count, 0;
    RETURN;
  END IF;

  UPDATE public.daily_check_usage
  SET check_count = check_count + 1
  WHERE device_id = _device_id AND usage_date = _today
  RETURNING check_count INTO _count;

  RETURN QUERY SELECT true, _count, GREATEST(_limit - _count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_daily_check(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_daily_check(text, integer) TO service_role;