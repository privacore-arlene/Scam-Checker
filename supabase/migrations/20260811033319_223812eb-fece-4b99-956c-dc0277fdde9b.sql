CREATE TABLE public.scam_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  source_label text NOT NULL,
  body text NOT NULL,
  icon text NOT NULL DEFAULT 'AlertCircle',
  channel text NOT NULL DEFAULT 'other',
  source_url text,
  alert_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Vancouver')::date,
  status text NOT NULL DEFAULT 'pending',
  sort_order integer NOT NULL DEFAULT 0,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX scam_alerts_fingerprint_key ON public.scam_alerts (fingerprint);
CREATE INDEX scam_alerts_status_idx ON public.scam_alerts (status, sort_order DESC, alert_date DESC);

GRANT SELECT ON public.scam_alerts TO anon;
GRANT SELECT ON public.scam_alerts TO authenticated;
GRANT ALL ON public.scam_alerts TO service_role;

ALTER TABLE public.scam_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved alerts are public"
  ON public.scam_alerts FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_scam_alerts_updated_at
  BEFORE UPDATE ON public.scam_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.scam_alerts (title, source_label, body, icon, channel, alert_date, status, sort_order, fingerprint) VALUES
('RCMP ''Court Delivery'' Text', 'RCMP Warning · Jan 2025', 'Text says RCMP couldn''t deliver court documents and you must click a link to reschedule. The RCMP never sends texts. Don''t click — delete and report.', 'MessageSquare', 'text', '2025-01-15', 'approved', 90, 'seed-rcmp-court-delivery-text'),
('RCMP ''Summons'' Email with PDF', 'Saskatchewan RCMP · Feb 2026', 'Email with an RCMP crest claims ''unacceptable activity'' on your network and attaches a PDF summons. The sender domain is fake. Don''t open the attachment.', 'Mail', 'email', '2026-02-01', 'approved', 95, 'seed-rcmp-summons-email-pdf'),
('RCMP ''Sexual Offences'' Extortion Email', 'RCMP Newfoundland · Jan 2026', 'Email signed by a fake ''RCMP Commissioner'' threatens an arrest warrant for sexual offences to scare you into paying. It is not real. Don''t respond — call your local police.', 'FileText', 'email', '2026-01-10', 'approved', 88, 'seed-rcmp-extortion-email'),
('Fake Police Video Call Scam', 'Manitoba RCMP · Feb 2026', 'A text or email invites you to a video call with a ''police officer'' who demands gift cards or Bitcoin. Real police never hold video calls or ask for crypto.', 'Video', 'other', '2026-02-05', 'approved', 92, 'seed-fake-police-video-call'),
('Parking Ticket Text Scam', 'Vancouver, West Van, Saskatoon · 2025–2026', 'Text demands immediate payment for an unpaid parking ticket via a link. Cities do not send parking notices by SMS. Check your city''s website directly.', 'Car', 'text', '2026-01-20', 'approved', 96, 'seed-parking-ticket-text'),
('Fake ''Fine Collection Branch'' Email', 'Saskatchewan RCMP · Feb 2026', 'Email pretends to be from a provincial fine collection office with a fake payment link. Always verify by calling the number on the official government website.', 'Mail', 'email', '2026-02-03', 'approved', 85, 'seed-fine-collection-email'),
('Fake Parking Meter QR Codes', 'Vancouver, Whistler, Penticton · Late 2025', 'Fraudulent QR stickers placed over real ones on parking meters lead to fake payment sites that steal credit card info. Use the official parking app instead of scanning.', 'QrCode', 'qr', '2025-11-15', 'approved', 94, 'seed-parking-meter-qr'),
('CRA GST/HST Refund Phishing', 'Active Canada-wide', 'Email or text offers a tax refund and asks you to ''complete an application'' via a link. The CRA never sends refund links by email or text. Log in at canada.ca directly.', 'Mail', 'email', '2026-01-05', 'approved', 87, 'seed-cra-gst-refund-phishing'),
('CRA/RCMP Crypto Warrant Scam', 'Active Canada-wide', 'Caller claims you have an arrest warrant and must send Bitcoin to ''cancel'' it, promising a refund later. The CRA never demands crypto. Hang up immediately.', 'Bitcoin', 'phone', '2026-01-08', 'approved', 89, 'seed-cra-crypto-warrant');