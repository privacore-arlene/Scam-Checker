# Host Fraud Doctor on thefrauddoctor.ca

## Goal
Make the Fraud Doctor app live at `thefrauddoctor.ca` instead of (or in addition to) the default Lovable preview URL.

## Steps

1. **Refresh the VirusTotal API key**
   - The current key is returning `401 Unauthorized`, so the second verification layer is offline.
   - Open the secure secret form for `VIRUSTOTAL_API_KEY` and save a fresh key from virustotal.com.

2. **Publish the app**
   - Click **Publish** in the editor. This deploys the app to a public `.lovable.app` URL.
   - Publishing is required before a custom domain can be connected.

3. **Connect `thefrauddoctor.ca` as a custom domain**
   - Go to **Project Settings → Project → Domains** (or use the Publish dialog → **Add custom domain**).
   - Add both `thefrauddoctor.ca` and `www.thefrauddoctor.ca`.
   - Lovable will provide DNS records to add at your domain registrar.

4. **Add DNS records at your registrar**
   - Add the A records and TXT verification record Lovable gives you.
   - If your DNS uses Cloudflare or another proxy, enable the proxy option in Lovable's domain setup.
   - Wait for propagation (up to 72 hours, often much faster).

5. **Verify the live site**
   - Test `https://thefrauddoctor.ca` loads correctly.
   - Run a scam check to confirm Google Safe Browsing and VirusTotal are both working.

## Notes
- Custom domains require a paid Lovable plan.
- Publishing and domain setup do not consume AI credits.
- Once live, the app can still be embedded in Wix via iframe if you later want it on another page too.
