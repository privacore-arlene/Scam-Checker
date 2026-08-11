ALTER TABLE public.scam_alerts
  ADD COLUMN IF NOT EXISTS source_links jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.scam_alerts
SET source_links = jsonb_build_array(
      jsonb_build_object('label', source_label, 'url', source_url)
    )
WHERE source_url IS NOT NULL
  AND source_links = '[]'::jsonb;