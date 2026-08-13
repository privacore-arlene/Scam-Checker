# Scam Checker — API Abuse Protection

Goal: stop anyone from calling the analysis service directly, stop the 3-a-day limit from being bypassed with random device IDs, and cap what any one network can spend — without touching design, languages, limits shown to users, hosting, or the direct-access redirect. Nothing gets published.

One note before we start: this project's four languages are **English, French, Simplified Chinese, Punjabi**. Traditional Chinese was removed at your earlier request, so testing will cover those four (French in its place).

## What the visitor sees

- A small Cloudflare "Verify you are human" checkbox (Managed mode) sitting just above the existing "Check this message" button, in the same navy/gold styling, with large text.
- The button stays disabled until the check passes, with a calm line of text explaining why.
- After each analysis the widget quietly resets so the next check gets a fresh token.
- The widget follows the selected language where Cloudflare supports it.
- Existing warm 3-checks-a-day LimitCard stays exactly as it is. A new, calm generic message appears only if the wider network safety ceiling is hit.

## Protection rules

| Control | Rule |
| --- | --- |
| Turnstile | Required on every anonymous check; verified server-side before any paid call |
| Device daily | 3 completed checks per device per day (unchanged) |
| Network daily | 10 checks per pseudonymous IP key per UTC day |
| Network burst | 5 checks per pseudonymous IP key per 10 minutes |
| Text | Max 4,000 characters, rejected (never truncated) |
| Screenshot | PNG / JPEG / WebP only, magic bytes must match declared type, max 8 MB decoded |
| Request body | Oversize bodies rejected with 413 before processing |

Order of operations on every request: CORS origin check → body size → shape/text/image validation → Turnstile verify → device quota → IP daily quota → IP burst quota → only then Safe Browsing / VirusTotal / AI.

If any quota or Turnstile step cannot be completed (database error, Cloudflare unreachable, secret missing), the request **fails closed** with a friendly "temporarily unavailable" message — no paid call is made.

## Technical detail

**Frontend — `src/components/FraudChecker.tsx`, `src/lib/i18n.tsx`**
- Load `https://challenges.cloudflare.com/turnstile/v0/api.js` once; render an explicit widget with sitekey `0x4AAAAAAEOiDcGMzub9py6o`, `action: "check-scam"`, `appearance: "always"`, and `language` mapped from the selected app language (en, fr, zh-CN, pa → fallback en when unsupported).
- Submit blocked until `token` state is set; token sent as `turnstile_token`; `turnstile.reset()` on success, error, expiry and every completed attempt.
- New localized strings in all four dictionaries: verification prompt, verification-failed message, network-ceiling message.

**Edge function — `supabase/functions/check-scam/index.ts`**
- Dynamic CORS: exact allow-list `https://frauddoctor-care.lovable.app` plus the Lovable preview host and localhost for development; `Vary: Origin`; correct `OPTIONS` handling; disallowed browser origins rejected before work. No `X-Frame-Options` added.
- `verifyTurnstile()`: rejects missing tokens and tokens over 2,048 chars, POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET` (read from server env only), `remoteip` from the trusted first `CF-Connecting-IP` / left-most `x-forwarded-for` value, 5s timeout. Requires `success === true`, `hostname === "frauddoctor-care.lovable.app"`, `action === "check-scam"`. Returns a fixed error code `verification_failed`; Cloudflare's raw body is never returned or logged.
- Input validation: text `> 4000` chars → reject; `content-length` over the ~11 MB base64 ceiling → 413; image data URL decoded and checked against magic bytes (PNG `89504E47`, JPEG `FFD8FF`, WebP `RIFF....WEBP`), declared MIME must match, decoded size ≤ 8 MB; SVG/GIF/anything else rejected with one fixed message.
- VirusTotal: remove the submit-and-poll block entirely — cached lookup only; `404` becomes "unknown" and analysis continues on other signals. Error logging reduced to provider name, status code and a random correlation id — no URL, path or query string.
- AI Gateway call wrapped in an `AbortController` with a 30s timeout (Safe Browsing 5s and VirusTotal 4s timeouts unchanged).
- Catch-all handler returns fixed safe text only; `e.message` no longer returned to the client.
- Internal/MCP path: accepts a server-only `x-internal-analysis-token` matching a new generated secret `INTERNAL_ANALYSIS_TOKEN`, which skips Turnstile (not the input or size limits). This value lives only in server env — the browser bundle never sees it, so it is not a spoofable client flag. `src/lib/mcp/tools/check-message.ts` sends that header, so the OAuth-protected MCP tool keeps working unchanged for authenticated agents.

**Database migration**
- New table `public.ip_rate_limits` (`ip_hash text`, `window_kind text` — `day` or `burst`, `window_start timestamptz`, `count int`, primary key on hash+kind+window_start). RLS enabled, no policies, no grants to `anon`/`authenticated`; only the service role reaches it.
- New security-definer RPC `consume_ip_check(_ip_hash text, _daily_limit int, _burst_limit int)` performing both increments in a single atomic statement (`INSERT … ON CONFLICT … DO UPDATE` with row locking) and returning `allowed`, which ceiling was hit, and reset times — race-safe under concurrency.
- Cleanup: the same RPC deletes burst rows older than 30 minutes and daily rows older than 2 days on each call.
- IP identity: `hmac_sha256(key = existing server-only secret, "fd-scam-ip:v1|" + ip)`, hex-encoded. Domain-separated, and only the hash is ever stored, logged or returned. Raw IPs are never written anywhere.

**Testing (`e2e/turnstile-abuse-check.py` + `e2e/scam-check.py`, `e2e/language-check.py` reruns)**
- Cloudflare's official test keys / mocked siteverify used for automated tests; no repeated paid AI calls.
- Cases: valid token passes; missing / malformed / oversized / reused token rejected before any paid call; wrong hostname and wrong action rejected; randomized `device_id` still blocked by the IP daily ceiling; 6 rapid concurrent requests blocked by the burst limit; simulated quota DB failure fails closed; existing 3-per-day device limit still returns the warm LimitCard; oversized text, body and image rejected; JPEG-labelled PNG and fake magic bytes rejected; logs and error bodies scanned to prove no URLs, message text or secrets appear; unknown URL is not submitted to VirusTotal; all four languages still pass; screenshot upload, results, mobile layout and accessibility unchanged; build and typecheck pass; direct-navigation redirect and `frame-ancestors` header verified intact.

**Needs live verification after publishing (cannot be fully tested unpublished)**
- The real Turnstile hostname must be `frauddoctor-care.lovable.app`, which only occurs on the published origin — the strict hostname check will be left at full strength and verified post-publish with one real check from the embedded page on thefrauddoctor.ca.
- Real CORS behaviour from the published iframe origin.

Scope: only this project is touched, and nothing is published.
