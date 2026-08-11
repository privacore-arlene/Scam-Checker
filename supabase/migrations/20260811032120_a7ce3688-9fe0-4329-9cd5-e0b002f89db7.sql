REVOKE ALL ON FUNCTION public.consume_daily_check(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_check(text, integer) TO service_role;