-- fraud_check_leads: keep insert-only for the public, explicitly deny all reads/updates/deletes
REVOKE SELECT, UPDATE, DELETE ON public.fraud_check_leads FROM anon, authenticated;
GRANT INSERT ON public.fraud_check_leads TO anon, authenticated;
GRANT ALL ON public.fraud_check_leads TO service_role;

DROP POLICY IF EXISTS "No client reads of lead contact data" ON public.fraud_check_leads;
CREATE POLICY "No client reads of lead contact data"
  ON public.fraud_check_leads
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (false);

-- ip_rate_limits: service-role / security-definer only
REVOKE ALL ON public.ip_rate_limits FROM anon, authenticated;
GRANT ALL ON public.ip_rate_limits TO service_role;

DROP POLICY IF EXISTS "Rate limit rows are server-only" ON public.ip_rate_limits;
CREATE POLICY "Rate limit rows are server-only"
  ON public.ip_rate_limits
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);