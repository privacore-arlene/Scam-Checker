# Manual Turnstile verification (one human check after deployment)

Automated tests do **not** and must **not** bypass, mock, disable or weaken
production Cloudflare Turnstile. The headless tests stub the Turnstile browser
script inside the test browser only, so the interface past the widget can be
exercised. A genuine Turnstile token cannot be produced by headless Chromium.

Therefore, after each deployment, one human must run this single check:

1. Open the Scam Checker where it is embedded on `thefrauddoctor.ca`.
2. Confirm the Turnstile widget renders and complete it as a real person.
3. Tick the consent checkbox: "I understand this is an automated educational
   screening, not a guarantee of safety."
4. Paste a sample scam message (no real personal data) and press
   **Check This Message**.
5. Confirm:
   - a diagnosis card appears with a verdict of HIGH RISK, BE CAREFUL or
     NO KNOWN WARNING FOUND;
   - the **What was checked** section lists Sender identity: Not verified,
     Phone or email ownership: Not verified, Website legitimacy: Not proven,
     Attachments: Not checked;
   - HIGH RISK / BE CAREFUL results show the escalation notice;
   - no "safe", "legitimate", "verified", "Danger: Low", VirusTotal,
     Malwarebytes or Google Safe Browsing wording appears.

If step 2 fails with a Turnstile error code, the hostname allow-list needs the
current host added — do not relax the fail-closed validation.
