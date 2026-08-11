CREATE TABLE public.fraud_check_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  verdict text,
  scam_type text,
  wants_tips boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.fraud_check_leads TO anon, authenticated;
GRANT ALL ON public.fraud_check_leads TO service_role;

ALTER TABLE public.fraud_check_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can request the full report"
ON public.fraud_check_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(name) BETWEEN 1 AND 100
  AND char_length(email) BETWEEN 3 AND 255
  AND email LIKE '%_@_%._%'
);

CREATE TRIGGER update_fraud_check_leads_updated_at
BEFORE UPDATE ON public.fraud_check_leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();