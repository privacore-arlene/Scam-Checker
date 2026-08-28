// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Exact browser origins allowed to call this function. The checker runs inside an
 * iframe, so requests come from the app's own origin, not the parent site.
 * This is not authentication (headers can be forged) — Turnstile and the
 * server-side rate limits are the real controls.
 */
const ALLOWED_ORIGINS: readonly string[] = [
  "https://frauddoctor-care.lovable.app",
  "https://id-preview--6177fe6d-cdb5-43a9-89f4-235bb7d1d073.lovable.app",
  "https://6177fe6d-cdb5-43a9-89f4-235bb7d1d073.lovableproject.com",
  "http://localhost:8080",
];

function corsFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-internal-analysis-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** A browser request carries an Origin; server-to-server callers do not. */
function originAllowed(origin: string | null): boolean {
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

const SYSTEM_PROMPT = `You are "The Fraud Doctor", a warm, calm, reassuring expert helping seniors in Canada identify scams. Diagnose suspicious messages, emails, phone scripts, or URLs with confidence and clarity.

TONE:
- Like a trusted family doctor speaking to an 80-year-old. Warm, calm, never alarming.
- Plain English. No jargon. Short sentences.
- Give the strongest conclusion supported by the available evidence. Never create false reassurance. If there is not enough evidence to establish legitimacy, say so clearly and recommend verification.

WHAT THIS CHECK CAN AND CANNOT DO:
- This check reads the wording of the message only. No link-reputation database, sender lookup, phone lookup or attachment scan is performed.
- NEVER say or imply that a link, website, sender, phone number or email address was checked, scanned, cleared or verified by any service or provider. Never name a security vendor or reputation service.

VERDICT MODEL (use exactly one of these three findings):
- "HIGH RISK" — strong evidence of a scam: clear impersonation, a request for gift cards or crypto, a request for passwords or verification codes, a fake emergency, payment diversion, an obvious lookalike or spoofed domain, or other strong scam indicators.
- "BE CAREFUL" — suspicious indicators exist, evidence is inconclusive, legitimacy cannot be established, a URL is unknown, or money/credentials/sensitive information are involved and cannot be reliably verified.
- "NO KNOWN WARNING FOUND" — no obvious scam warning sign was found in the wording. This never means safe or legitimate.
NEVER use the words "Safe", "Looks Safe", "Verified Safe" or "definitely legitimate" anywhere in your output, and never imply them.

EVIDENCE-LIMITED WORDING (applies to every verdict, especially low-risk ones):
- A displayed URL on an official-looking domain does NOT prove who sent the message, that the message itself is genuine, that a clickable link actually points to the address shown, or that the page or sender is legitimate.
- NEVER write claims such as "the page is real", "this is a real website", "the sender is genuine", "this message is legitimate", "the link is verified" or "the site is safe" — and never phrase the same idea in other words.
- For an official-looking domain, use evidence-limited wording, for example: "The URL shown uses the official canada.ca domain. That does not confirm who sent the message, and it does not guarantee that a clickable link goes to the address shown."
- Describe only what was actually observed: the visible URL, the wording of the message, and what could not be verified.
- Always keep the reminder that no warning sign being found does not prove legitimacy.

CANADIAN SCAM PLAYBOOK (most common — match these patterns aggressively):

1. CRA / TAX IMPERSONATION: Claims you owe taxes, threatens arrest/deportation, demands payment by gift card, Bitcoin, or e-Transfer. The real CRA NEVER threatens arrest, NEVER asks for gift cards or crypto, NEVER calls about urgent payment.

2. SERVICE CANADA / SIN SCAM: "Your SIN has been compromised/suspended." Service Canada NEVER suspends SINs and NEVER calls unsolicited about them.

3. GRANDPARENT SCAM: "Grandma, it's me, I'm in jail/hospital, please don't tell mom and dad, send money fast." Often via gift cards or wire transfer. Voice may sound off — increasingly uses AI voice cloning.

4. INTERAC E-TRANSFER PHISHING: Fake "deposit pending" notices with a link to "accept." Real Interac emails come from notify@payments.interac.ca and never require you to enter your bank password on a third-party page.

5. BANK FRAUD ALERT SCAM (RBC, TD, Scotiabank, BMO, CIBC, National Bank, Desjardins): Caller claims fraud on your account, asks you to "move money to a safe account" or read out a verification code. Real banks NEVER ask you to move money or share codes.

6. AMAZON / COSTCO / CANADA POST PARCEL SCAMS: "Suspicious order," "delivery failed, pay $2 redelivery fee," "click to track." Canada Post NEVER charges redelivery via SMS link.

7. ROMANCE / PIG-BUTCHERING: New online friend, lots of attention, eventually asks for money, crypto investment, or help with a "stuck shipment." Often claims to be on an oil rig, military deployment, or working overseas.

8. TECH SUPPORT POPUPS: "Microsoft/Apple detected a virus, call this number." Microsoft and Apple NEVER put phone numbers in popups.

9. RCMP / POLICE IMPERSONATION: Threatens arrest unless you pay. Police NEVER demand payment over the phone.

10. INVESTMENT / CRYPTO SCAMS: Guaranteed returns, "exclusive opportunity," celebrity endorsements (Elon Musk, Kevin O'Leary deepfakes). If returns are guaranteed, it is a scam.

11. CHARITY / DISASTER RELIEF SCAMS: Urgent donations after a tragedy, pressure to give now, payment via gift card or e-Transfer.

12. JOB / WORK-FROM-HOME SCAMS: Easy money, mystery shopper, reshipping packages, fake check overpayment.

13. QUISHING (QR-CODE PHISHING): A QR code on a parking meter, pay station, parcel notice, restaurant table, or flyer that sends you to a fake payment page. Vancouver and other Canadian cities have seen fraudsters stick fake QR stickers OVER real ones on city parking meters and EasyPark stations. The fake site looks like the real parking app and steals credit card and personal info. RED FLAGS: QR sticker looks freshly applied, peels at the edges, is placed OVER printed text, or the URL after scanning is not the official city/operator domain (e.g. not vancouver.ca, paybyphone.com, easypark.ca). If a message describes a QR code from an unknown sender (parking, parcel delivery, "scan to verify your account", "scan to claim refund"), treat it as a scam.
QUISHING WHAT-TO-DO:
- Do NOT scan QR codes on parking meters, pay stations, or stickers — type the official app name into your phone's app store, or pay at the meter with coin/card directly.
- If you already scanned, do NOT enter any card info on the page that opened. Close it.
- Report fake QR stickers to the city (311 in Vancouver) and to the parking operator (PayByPhone, EasyPark).
- For any QR in an email, text, or letter: ignore it. Go to the company's website by typing the address yourself.

URL RED FLAGS to watch for:
- Lookalike domains (cra-canada-gc.com vs cra-arc.gc.ca, interac-secure.com vs interac.ca, amaz0n.ca, canadapost-track.com)
- IP addresses or random subdomains
- Wrong TLDs (.gc.ca is the only legit Government of Canada domain — beware .gov.ca, .ca.gov, .gc.com)
- URL shorteners (bit.ly, tinyurl) hiding the real destination
- Punycode/Unicode lookalike letters

UNIVERSAL RED FLAGS:
- Urgency + secrecy ("don't tell anyone, act now")
- Payment by gift card (Apple, Google Play, Amazon, Steam), Bitcoin, wire transfer, or e-Transfer to a stranger
- Requests for SIN, banking password, one-time passwords, or remote access to your computer
- Generic greetings ("Dear Customer"), spelling errors, wrong logos
- Caller ID spoofing — caller ID can be faked, never trust it alone

WHAT-TO-DO ADVICE (always include where relevant):
- Hang up / do not click / do not reply
- Call the organization back using the number on their official website or the back of your card — never the number the caller gave you
- Report to the Canadian Anti-Fraud Centre at 1-888-495-8501 or https://antifraudcentre-centreantifraude.ca/report-signalez-eng.htm
- Tell a family member you trust
- If money was sent: call your bank immediately, then local police

Use the diagnose_message tool to return your structured diagnosis.`;

// Extract URLs so the result can state which links were NOT reputation-checked
function extractUrls(text: string): string[] {
  const urlRegex = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  const matches = text.match(urlRegex) || [];
  const cleaned = matches.map((u) => {
    let url = u.replace(/[.,;:!?)\]}'"]+$/, "");
    if (url.startsWith("www.")) url = "http://" + url;
    return url;
  });
  return Array.from(new Set(cleaned)).slice(0, 5);
}



/**
 * Operational-only provider log. Never receives a URL, message, screenshot,
 * prompt or response — provider name plus a status/code and a correlation id.
 */
let correlationId = "-";
function logProvider(provider: string, status: string | number): void {
  console.error(`provider=${provider} status=${status} cid=${correlationId}`);
}

// fetch with AbortController timeout
async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Link-reputation providers are switched OFF in this build.
 *
 * The VirusTotal public API and the Google Safe Browsing API are not licensed
 * for commercial use, so neither is called at runtime. Nothing simulates or
 * substitutes their result: URLs are reported to the user as NOT checked until
 * a commercial link-reputation provider is in place.
 */

// ---- Free daily allowance -------------------------------------------------
const FREE_DAILY_LIMIT = 3;

// A signed-in member gets unlimited checks. The token's signature is verified
// by Supabase Auth — a decoded-but-unsigned token is never trusted.
async function isMember(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) return false;

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anonKey) return false;
  // The publishable key alone must never count as a member.
  if (token === anonKey) return false;

  try {
    const res = await fetchWithTimeout(
      `${url}/auth/v1/user`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
      6000,
    );
    if (!res.ok) return false;
    const user = await res.json();
    return typeof user?.id === "string" && user.id.length > 0;
  } catch (e) {
    logProvider("auth", "member_check_failed");
    return false;
  }
}


// ---- Input ceilings -------------------------------------------------------
const MAX_TEXT_CHARS = 4000;
const MAX_BODY_BYTES = 1 * 1024 * 1024;

// ---- Trusted internal caller (OAuth-protected MCP) ------------------------
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isInternalCaller(req: Request): boolean {
  const expected = (Deno.env.get("INTERNAL_ANALYSIS_TOKEN") || "").trim();
  const supplied = (req.headers.get("x-internal-analysis-token") || "").trim();
  if (!expected || !supplied) return false;
  return timingSafeEqualStr(expected, supplied);
}

// ---- Cloudflare Turnstile -------------------------------------------------
const TURNSTILE_HOSTNAMES: readonly string[] = [
  "frauddoctor-care.lovable.app",
  "id-preview--6177fe6d-cdb5-43a9-89f4-235bb7d1d073.lovable.app",
  "6177fe6d-cdb5-43a9-89f4-235bb7d1d073.lovableproject.com",
];
const TURNSTILE_ACTION = "check-scam";
const TURNSTILE_MAX_TOKEN = 2048;

/** Trusted client IP, taken only from the platform-set forwarding headers. */
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return fwd;
}

async function verifyTurnstile(
  token: unknown,
  req: Request,
): Promise<{ ok: true } | { ok: false; code: string }> {
  if (typeof token !== "string" || token.trim().length === 0) {
    return { ok: false, code: "turnstile_missing" };
  }
  if (token.length > TURNSTILE_MAX_TOKEN) return { ok: false, code: "turnstile_invalid" };
  const secret = (Deno.env.get("TURNSTILE_SECRET") || "").trim();
  // Fail closed: no secret means no verification is possible.
  if (!secret) {
    logProvider("turnstile", "no_secret");
    return { ok: false, code: "turnstile_unavailable" };
  }

  const form = new URLSearchParams({ secret, response: token });
  const ip = clientIp(req);
  if (ip) form.set("remoteip", ip);

  try {
    const res = await fetchWithTimeout(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form },
      6000,
    );
    if (!res.ok) {
      logProvider("turnstile", res.status);
      return { ok: false, code: "turnstile_unavailable" };
    }
    const data = await res.json();
    if (data?.success !== true) return { ok: false, code: "turnstile_invalid" };
    if (typeof data?.hostname !== "string" || !TURNSTILE_HOSTNAMES.includes(data.hostname)) {
      logProvider("turnstile", "hostname_mismatch");
      return { ok: false, code: "turnstile_invalid" };
    }
    if (data?.action !== TURNSTILE_ACTION) {
      logProvider("turnstile", "action_mismatch");
      return { ok: false, code: "turnstile_invalid" };
    }
    return { ok: true };
  } catch (e) {
    logProvider("turnstile", e instanceof Error && e.name === "AbortError" ? "timeout" : "exception");
    return { ok: false, code: "turnstile_unavailable" };
  }
}

// ---- Hidden network ceilings ---------------------------------------------
const IP_DAILY_LIMIT = 10;
const IP_BURST_LIMIT = 5;

/**
 * Pseudonymous, domain-separated HMAC of the caller IP. The raw IP is never
 * stored, logged, returned or sent anywhere; the key is a server-only secret.
 */
async function ipHash(req: Request): Promise<string | null> {
  const ip = clientIp(req);
  if (!ip) return null;
  const keyMaterial = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!keyMaterial) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`fd:check-scam:ip:v1|${ip}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type NetGate = { allowed: boolean; reason: string; resets_at: string } | "unavailable";

async function consumeIpCheck(req: Request): Promise<NetGate> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return "unavailable";
  const hash = await ipHash(req);
  if (!hash) return "unavailable";
  try {
    const res = await fetchWithTimeout(`${url}/rest/v1/rpc/consume_ip_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ _ip_hash: hash, _daily_limit: IP_DAILY_LIMIT, _burst_limit: IP_BURST_LIMIT }),
    }, 6000);
    if (!res.ok) {
      logProvider("ip_quota", res.status);
      return "unavailable";
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return "unavailable";
    return {
      allowed: !!row.allowed,
      reason: String(row.reason || ""),
      resets_at: String(row.resets_at || ""),
    };
  } catch (e) {
    logProvider("ip_quota", e instanceof Error && e.name === "AbortError" ? "timeout" : "exception");
    return "unavailable";
  }
}

// ---- Per-device daily allowance ------------------------------------------
/** Device id is one signal only; the network ceilings above are the backstop. */
function usageKey(deviceId: unknown, req: Request): string {
  const id = typeof deviceId === "string" ? deviceId.trim().slice(0, 100) : "";
  if (id.length >= 8) return `dev:${id}`;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return `ip:${ip || "unknown"}`;
}

function nextVancouverMidnightISO(): string {
  const now = new Date();
  // Vancouver is UTC-8 (PST) / UTC-7 (PDT); use the offset the runtime reports.
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Vancouver" }));
  const offsetMs = now.getTime() - local.getTime();
  const nextLocalMidnight = new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1, 0, 0, 0);
  return new Date(nextLocalMidnight.getTime() + offsetMs).toISOString();
}

type DeviceGate = { allowed: boolean; used: number; remaining: number } | "unavailable";

async function consumeDailyCheck(deviceId: unknown, req: Request): Promise<DeviceGate> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Quota state unknown → fail closed.
  if (!url || !serviceKey) return "unavailable";
  try {
    const res = await fetchWithTimeout(`${url}/rest/v1/rpc/consume_daily_check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ _device_id: usageKey(deviceId, req), _limit: FREE_DAILY_LIMIT }),
    }, 6000);
    if (!res.ok) {
      logProvider("device_quota", res.status);
      return "unavailable";
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return "unavailable";
    return { allowed: !!row.allowed, used: Number(row.used) || 0, remaining: Number(row.remaining) || 0 };
  } catch (e) {
    logProvider("device_quota", e instanceof Error && e.name === "AbortError" ? "timeout" : "exception");
    return "unavailable";
  }
}

const FRAMEWORK_PROMPT = `

ALWAYS answer using The Fraud Doctor framework: STOP · VERIFY · CALL. Every result must contain all three, written dynamically for the exact situation in front of you.

- stop: 1-3 short lines saying exactly what the person should NOT do yet. Pick only what fits the situation, e.g. "Don't click the link.", "Don't send money.", "Don't reply yet.", "Don't give them your password.", "Don't share the security code.", "Don't give remote access to your computer.", "Don't move money to another account.", "Don't provide personal information."
- verify: 1-3 short lines saying exactly what needs to be checked, in plain language an older adult can follow. Examples: bank → "Check the request directly with your bank."; family emergency → "Check that your family member is actually in trouble."; CRA → "Check your CRA account directly rather than using this message."; parcel → "Open the Canada Post app or website yourself and check the tracking information."; online account → "Open the company's normal app or website yourself. Don't use the link in the message."
- call: 1-3 short lines saying WHO to contact and HOW to find a trustworthy number. Never simply say "call the company". Use the right one:
  BANK: "Call the number on the back of your bank card. Don't call the number in this message."
  FAMILY MEMBER: "Call your family member using the number already saved in your phone. If you can't reach them, call another family member who can check on them."
  CRA: "Use the contact information on the official Government of Canada website, or sign in to your CRA account directly."
  POLICE: "Hang up and find your local police service's official non-emergency number yourself. Don't use a number the caller gave you."
  COMPANY: "Open the company's official app or type its website address yourself. Use the contact information there — not the number or link in this message."
  TECH SUPPORT: "Do not call the number in the popup. If you need help, contact Apple, Microsoft or your trusted computer support person independently."
  UNKNOWN: "If you're still unsure, call a family member or trusted person before doing anything."
  Add the Canadian Anti-Fraud Centre at 1-888-495-8501 when money or personal details were already shared.

Also list red_flags: 2-4 short, specific reasons drawn from the actual wording, sender, link or phone number in front of you — never vague statements. If nothing suspicious stands out, list what could not be confirmed instead.
Tone: professional, calm, practical, never alarmist. Never scold. Never ask for or invite passwords, SIN, account numbers or banking details. Even when nothing suspicious was found, still give a calm stop/verify/call and remind the person that no known warning is not proof of legitimacy.`;


serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = corsFor(origin);
  correlationId = crypto.randomUUID().slice(0, 8);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  // Origin allow-list. Not authentication (headers can be forged) — Turnstile
  // and the server-side counters below are the real controls.
  if (!originAllowed(origin)) {
    return json({
      error: "This checker needs to be opened from thefrauddoctor.ca. Please refresh the page and try again.",
      code: "origin_not_allowed",
    }, 403);
  }

  try {
    // Every refusal below carries plain-English wording as well as a code, so a
    // senior always sees what happened and what to do next — never a bare
    // technical label.
    const TOO_LONG_MSG =
      "That message is a little too long to check. Please paste just the part you are worried about \u2014 about one page or less \u2014 and try again.";
    const UNREADABLE_MSG =
      "We could not read what was sent. Please refresh this page, paste the wording again, and press \u201cCheck This Message\u201d.";

    // Reject oversized bodies before doing any work (text-only input).
    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return json({ error: TOO_LONG_MSG, code: "body_too_large" }, 413);
    }
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return json({ error: TOO_LONG_MSG, code: "body_too_large" }, 413);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: UNREADABLE_MSG, code: "invalid_body" }, 400);
    }
    // A body that parsed but is not an object (a bare string, number or array)
    // is treated the same way: nothing usable to check.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: UNREADABLE_MSG, code: "invalid_body" }, 400);
    }
    const { message, image, lang, device_id, turnstile_token } = parsed ?? {};

    const LANG_NAMES: Record<string, string> = {
      en: "English",
      fr: "Canadian French (français canadien)",
      "zh-Hans": "Simplified Chinese (简体中文)",
      pa: "Punjabi (ਪੰਜਾਬੀ, Gurmukhi script)",
    };
    const targetLang = LANG_NAMES[lang as string] || "English";
    const langInstruction = targetLang === "English"
      ? ""
      : `\n\nIMPORTANT: Write ALL output (scam_type, explanation, what_to_do steps) in ${targetLang}. Keep proper nouns like CRA, Service Canada, Interac, RBC, Canadian Anti-Fraud Centre, and phone numbers (1-888-495-8501) in their original form. Use warm, simple language an elderly speaker can easily understand.`;

    if (typeof message === "string" && message.length > MAX_TEXT_CHARS) {
      return json({ error: "too_long", code: "text_too_long", max: MAX_TEXT_CHARS }, 413);
    }
    const hasMessage = typeof message === "string" && message.trim().length >= 2;

    // Screenshot checking is temporarily switched off while its privacy
    // protection is improved. Images are refused outright — never analyzed.
    if (image != null) {
      return json({ error: "screenshot_disabled", code: "image_disabled" }, 400);
    }

    if (!hasMessage) {
      return json({ error: "Please paste the wording of the message.", code: "empty_input" }, 400);
    }

    // Trusted internal path (OAuth-protected MCP tools call the function with a
    // server-only shared token). Never settable from a browser.
    const internal = isInternalCaller(req);

    if (!internal && !(await isMember(req))) {
      // 1. Human check first — before any paid provider call.
      const ts = await verifyTurnstile(turnstile_token, req);
      if (!ts.ok) return json({ error: "turnstile_failed", code: ts.code }, 403);
    }

    // 2. Usage ceilings — device allowance, then hidden network ceilings.
    let remainingToday: number | null = null;
    if (!internal && !(await isMember(req))) {
      const gate = await consumeDailyCheck(device_id, req);
      if (gate === "unavailable") {
        return json({ error: "temporarily_unavailable", code: "quota_unavailable" }, 503);
      }
      if (!gate.allowed) {
        return json({
          limit_reached: true,
          limit: FREE_DAILY_LIMIT,
          used: gate.used,
          resets_at: nextVancouverMidnightISO(),
        }, 429);
      }
      remainingToday = gate.remaining;

      const netGate = await consumeIpCheck(req);
      if (netGate === "unavailable") {
        return json({ error: "temporarily_unavailable", code: "quota_unavailable" }, 503);
      }
      if (!netGate.allowed) {
        return json({
          network_limit_reached: true,
          reason: netGate.reason,
          resets_at: netGate.resets_at,
        }, 429);
      }
    }



    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // 1. No external URL-reputation provider runs in this build. URLs are still
    // extracted so the result can state plainly that their reputation was NOT
    // checked. No simulated or placeholder reputation result is ever produced.
    const urls = hasMessage ? extractUrls(message) : [];

    let urlEvidence = "";
    if (urls.length > 0) {
      urlEvidence = `\n\nURL REPUTATION RESULTS: NOT AVAILABLE. No link-reputation database was consulted for this check. You must NOT say or imply that any link, website or sender was checked, cleared, verified or found safe. Judge the message only on its wording, sender, urgency and the URL pattern itself (domain spelling, top-level domain, lookalike domains, unusual subdomains). If a link is involved and money, credentials or personal information are at stake, use "BE CAREFUL" and advise the person not to click the link until they can confirm it independently.`;
    }

    // Build user message — text only (screenshot checking is switched off).
    const userContent: any[] = [];
    const textPart = `Please diagnose this suspicious content for a Canadian senior:\n\n"""${message.slice(0, 6000)}"""${urlEvidence}`;
    userContent.push({ type: "text", text: textPart });

    // 2. Send to Gemini Pro for full diagnosis (30s ceiling)
    const aiCtrl = new AbortController();
    const aiTimer = setTimeout(() => aiCtrl.abort(), 30000);
    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      signal: aiCtrl.signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + FRAMEWORK_PROMPT + langInstruction },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "diagnose_message",
              description: "Return a clear scam diagnosis.",
              parameters: {
                type: "object",
                properties: {
                  verdict: {
                    type: "string",
                    enum: ["HIGH RISK", "BE CAREFUL", "NO KNOWN WARNING FOUND"],
                    description: "HIGH RISK = strong signs of a scam. BE CAREFUL = warning signs, or legitimacy cannot be confirmed. NO KNOWN WARNING FOUND = no known threat or obvious scam warning (never means safe).",
                  },
                  scam_type: {
                    type: "string",
                    description: "Specific type, e.g. 'CRA Impersonation Scam', 'Grandparent Scam', 'Interac e-Transfer Phishing', 'Bank Fraud Alert Scam'. If nothing suspicious stands out, use 'No known scam pattern found'. Never use the word 'safe'.",
                  },
                  danger_level: {
                    type: "string",
                    enum: ["High", "Medium", "Low"],
                  },
                  explanation: {
                    type: "string",
                    description: "2-4 plain-English sentences explaining WHY. Warm and calm, like a doctor's diagnosis. Never say the message is safe or legitimate.",
                  },
                  what_to_do: {
                    type: "array",
                    items: { type: "string" },
                    description: "Exactly 3 short, simple bullet points telling the senior what to do next. Include a Canadian resource (CAFC 1-888-495-8501) when relevant.",
                    minItems: 3,
                    maxItems: 3,
                  },
                  red_flags: {
                    type: "array",
                    items: { type: "string" },
                    description: "2 to 4 very short, specific reasons for this risk level, each quoting or naming the exact detail seen (e.g. 'Threatens arrest if you don't pay today', 'Link is cra-secure-pay.com, not canada.ca'). If nothing suspicious stands out, name what could not be confirmed. Plain English, no jargon.",
                    minItems: 2,
                    maxItems: 4,
                  },
                  stop: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-3 short lines: exactly what NOT to do yet, chosen for this situation (e.g. 'Don't click the link.', 'Don't send money.', 'Don't share the security code.').",
                    minItems: 1,
                    maxItems: 3,
                  },
                  verify: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-3 short lines: exactly what needs to be checked, in plain language for an older adult (e.g. 'Check the request directly with your bank.', 'Open the Canada Post app or website yourself and check the tracking information.').",
                    minItems: 1,
                    maxItems: 3,
                  },
                  call: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-3 short lines: WHO to contact and HOW to find a trustworthy number (e.g. 'Call the number on the back of your bank card. Don't call the number in this message.'). Never just 'call the company'.",
                    minItems: 1,
                    maxItems: 3,
                  },
                  verification_needed: {
                    type: "boolean",
                    description: "True whenever the person should verify before acting — including any situation involving money, passwords, security codes, personal information, or a sender/link that cannot be confirmed.",
                  },
                  impersonation: {
                    type: "boolean",
                    description: "True when this involves someone pretending to be a person or organization the reader trusts — including grandparent/family emergency scams, AI voice cloning, bank, police, CRA or delivery impersonation.",
                  },
                },
                required: ["verdict", "scam_type", "danger_level", "explanation", "what_to_do", "red_flags", "stop", "verify", "call", "verification_needed", "impersonation"],

                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "diagnose_message" } },
      }),
      });
    } catch (e) {
      logProvider("ai_gateway", e instanceof Error && e.name === "AbortError" ? "timeout" : "exception");
      return json({ error: "Could not analyze right now.", code: "ai_unavailable" }, 504);
    } finally {
      clearTimeout(aiTimer);
    }


    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "We're getting a lot of checks right now. Please wait a moment and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "The Fraud Doctor is temporarily unavailable. Please try again later." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      logProvider("ai_gateway", response.status);
      return new Response(JSON.stringify({ error: "Could not analyze right now." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No diagnosis returned");
    const diagnosis = JSON.parse(toolCall.function.arguments);

    // Never let a reassuring wording through. Legacy/odd verdicts are mapped into
    // the three consumer findings, and a known threat always forces HIGH RISK.
    const NEW_VERDICTS = ["HIGH RISK", "BE CAREFUL", "NO KNOWN WARNING FOUND"];
    const rawVerdict = String(diagnosis.verdict || "").toUpperCase().trim();
    if (!NEW_VERDICTS.includes(rawVerdict)) {
      diagnosis.verdict = rawVerdict === "SCAM"
        ? "HIGH RISK"
        : rawVerdict === "LIKELY SCAM"
          ? "BE CAREFUL"
          : rawVerdict.includes("SAFE")
            ? "NO KNOWN WARNING FOUND"
            : "BE CAREFUL";
    } else {
      diagnosis.verdict = rawVerdict;
    }
    if (typeof diagnosis.verification_needed !== "boolean") {
      diagnosis.verification_needed = diagnosis.verdict !== "NO KNOWN WARNING FOUND";
    }


    // Attach evidence so the UI can report accurately what was and was not
    // checked. No external link-reputation provider runs in this build, so the
    // status is reported as "disabled" — never as a completed check.
    diagnosis.url_check = {
      checked: false,
      urls_found: urls,
      confirmed_threats: {},
      sources: { link_reputation: "disabled" },
    };

    if (remainingToday !== null) {
      diagnosis.free_checks = { remaining: remainingToday, limit: FREE_DAILY_LIMIT };
    }



    return new Response(JSON.stringify(diagnosis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Fixed message only — never the error text, stack or provider body.
    logProvider("check-scam", e instanceof Error ? e.name : "exception");
    return new Response(JSON.stringify({ error: "Could not analyze right now.", code: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
