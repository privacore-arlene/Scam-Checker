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
- ALWAYS give a clear verdict. NEVER say "I cannot determine" or hedge.

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

13. QUISHING (QR-CODE PHISHING): A QR code on a parking meter, pay station, parcel notice, restaurant table, or flyer that sends you to a fake payment page. Vancouver and other Canadian cities have seen fraudsters stick fake QR stickers OVER real ones on city parking meters and EasyPark stations. The fake site looks like the real parking app and steals credit card and personal info. RED FLAGS: QR sticker looks freshly applied, peels at the edges, is placed OVER printed text, or the URL after scanning is not the official city/operator domain (e.g. not vancouver.ca, paybyphone.com, easypark.ca). If a message or screenshot shows a QR code from an unknown sender (parking, parcel delivery, "scan to verify your account", "scan to claim refund"), treat it as a scam.
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

// Extract URLs from the message for Safe Browsing lookup
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

// Per-service status so the UI can honestly say what was checked.
type SourceStatus = "ok" | "threat" | "timeout" | "error" | "no_key";
type CheckResult = { status: SourceStatus; threats: Record<string, string> };

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

// VirusTotal v3 — LOOKUP ONLY. Unknown URLs are never submitted for scanning
// (that would send user content to a third party and create outbound scan load).
async function checkVirusTotal(urls: string[]): Promise<CheckResult> {
  const apiKey = Deno.env.get("VIRUSTOTAL_API_KEY");
  if (!apiKey) return { status: "no_key", threats: {} };
  if (urls.length === 0) return { status: "ok", threats: {} };

  const headers = { "x-apikey": apiKey };

  const formatStats = (stats: any): string | null => {
    if (!stats) return null;
    const bad = (stats.malicious || 0) + (stats.suspicious || 0);
    const total = bad + (stats.harmless || 0) + (stats.undetected || 0);
    if (bad > 0) return `${bad}/${total} security vendors flagged this URL as malicious`;
    return null;
  };

  const threats: Record<string, string> = {};
  let hadFailure = false;
  let hadTimeout = false;

  await Promise.all(
    urls.map(async (url) => {
      try {
        const id = btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const cached = await fetchWithTimeout(
          `https://www.virustotal.com/api/v3/urls/${id}`,
          { headers },
          4000,
        );
        if (cached.ok) {
          const data = await cached.json();
          const msg = formatStats(data?.data?.attributes?.last_analysis_stats);
          if (msg) threats[url] = msg;
          return;
        }
        // 404 = no existing record. Treat as unknown and rely on other signals.
        if (cached.status !== 404) {
          hadFailure = true;
          logProvider("virustotal", cached.status);
        }
      } catch (e) {
        hadFailure = true;
        const aborted = e instanceof Error && e.name === "AbortError";
        if (aborted) hadTimeout = true;
        logProvider("virustotal", aborted ? "timeout" : "exception");
      }
    }),
  );

  if (Object.keys(threats).length > 0) return { status: "threat", threats };
  if (hadFailure) return { status: hadTimeout ? "timeout" : "error", threats };
  return { status: "ok", threats };
}

// Google Safe Browsing v4 — 5s hard timeout.
async function checkSafeBrowsing(urls: string[]): Promise<CheckResult> {
  const apiKey = Deno.env.get("GOOGLE_SAFE_BROWSING_API_KEY");
  if (!apiKey) return { status: "no_key", threats: {} };
  if (urls.length === 0) return { status: "ok", threats: {} };

  try {
    const res = await fetchWithTimeout(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "fraud-doctor", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: urls.map((u) => ({ url: u })),
          },
        }),
      },
      5000,
    );
    if (!res.ok) {
      console.error("Safe Browsing error:", res.status, await res.text().catch(() => ""));
      return { status: "error", threats: {} };
    }
    const data = await res.json();
    const threats: Record<string, string> = {};
    for (const m of data.matches || []) threats[m.threat.url] = m.threatType;
    return { status: Object.keys(threats).length > 0 ? "threat" : "ok", threats };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error(aborted ? "Safe Browsing timeout" : "Safe Browsing exception:", e);
    return { status: aborted ? "timeout" : "error", threats: {} };
  }
}

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
    console.error("member check failed", e);
    return false;
  }
}


// ---- Input ceilings -------------------------------------------------------
const MAX_TEXT_CHARS = 4000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** 8 MB image grows ~33% in base64; leave headroom for the JSON envelope. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

type ImageVerdict = { ok: true; mime: string } | { ok: false; code: string };

/** Verify the real file signature; never trust the data-URL prefix. */
function validateImage(image: unknown): ImageVerdict {
  if (typeof image !== "string") return { ok: false, code: "image_invalid" };
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(image.trim());
  if (!match) return { ok: false, code: "image_invalid" };
  const declared = match[1].toLowerCase();
  const b64 = match[2];
  if (!["image/png", "image/jpeg", "image/webp"].includes(declared)) {
    return { ok: false, code: "image_type" };
  }
  // Decoded size from base64 length (no need to materialise the whole buffer).
  const padding = (b64.match(/=+$/)?.[0].length) ?? 0;
  const bytes = Math.floor((b64.length * 3) / 4) - padding;
  if (bytes <= 0) return { ok: false, code: "image_invalid" };
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, code: "image_too_large" };

  let head: Uint8Array;
  try {
    const raw = atob(b64.slice(0, 32));
    head = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch {
    return { ok: false, code: "image_invalid" };
  }
  const is = (offset: number, sig: number[]) => sig.every((b, i) => head[offset + i] === b);
  let actual: string | null = null;
  if (is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) actual = "image/png";
  else if (is(0, [0xff, 0xd8, 0xff])) actual = "image/jpeg";
  else if (is(0, [0x52, 0x49, 0x46, 0x46]) && is(8, [0x57, 0x45, 0x42, 0x50])) actual = "image/webp";

  if (!actual) return { ok: false, code: "image_signature" };
  if (actual !== declared) return { ok: false, code: "image_mismatch" };
  return { ok: true, mime: actual };
}

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
const TURNSTILE_HOSTNAME = "frauddoctor-care.lovable.app";
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
    if (data?.hostname !== TURNSTILE_HOSTNAME) {
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

ALWAYS answer using The Fraud Doctor framework: STOP · VERIFY · CALL.
- stop: what to stop doing right now, calmly.
- verify: how to check independently, using a number or address from the organization's own official website — never one from the message.
- call: who to phone (the real organization, a trusted family member, and the Canadian Anti-Fraud Centre at 1-888-495-8501 if money or personal details were already shared).
Also list red_flags: 2-4 short, specific reasons drawn from the actual wording, sender, link or phone number in front of you — never vague statements.
Tone: professional, calm, practical, never alarmist. Never scold. Never ask for or invite passwords, SIN, account numbers or banking details. When the message is safe, still give a short, reassuring stop/verify/call.`;


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
    return json({ error: "not_allowed", code: "origin_not_allowed" }, 403);
  }

  try {
    // Reject oversized bodies before doing any work (8 MB image ≈ 11 MB base64).
    const declaredLength = Number(req.headers.get("content-length") || "0");
    if (declaredLength > MAX_BODY_BYTES) {
      return json({ error: "too_large", code: "body_too_large" }, 413);
    }
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return json({ error: "too_large", code: "body_too_large" }, 413);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: "bad_request", code: "invalid_body" }, 400);
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

    let hasImage = false;
    if (image != null) {
      const imageCheck = validateImage(image);
      if (!imageCheck.ok) {
        return json({ error: "bad_image", code: imageCheck.code }, 400);
      }
      hasImage = true;
    }

    if (!hasMessage && !hasImage) {
      return json({ error: "Please paste a message or attach a screenshot.", code: "empty_input" }, 400);
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

    // 1. Run URL reputation checks in parallel (Safe Browsing + VirusTotal)
    const urls = hasMessage ? extractUrls(message) : [];
    const [sbRes, vtRes] = await Promise.all([
      checkSafeBrowsing(urls),
      checkVirusTotal(urls),
    ]);
    const threats = sbRes.threats;
    const vtThreats = vtRes.threats;
    const anyThreat = Object.keys(threats).length + Object.keys(vtThreats).length > 0;
    const anyDown = sbRes.status === "timeout" || sbRes.status === "error"
      || vtRes.status === "timeout" || vtRes.status === "error";

    let urlEvidence = "";
    if (urls.length > 0) {
      const lines: string[] = [];
      if (Object.keys(threats).length > 0) {
        lines.push(
          `GOOGLE SAFE BROWSING (authoritative):`,
          ...Object.entries(threats).map(([u, t]) => `- ${u} → CONFIRMED THREAT: ${t}`),
        );
      }
      if (Object.keys(vtThreats).length > 0) {
        lines.push(
          `VIRUSTOTAL (90+ security vendors):`,
          ...Object.entries(vtThreats).map(([u, t]) => `- ${u} → ${t}`),
        );
      }
      if (anyThreat) {
        urlEvidence =
          `\n\nURL REPUTATION RESULTS (trust these absolutely):\n` +
          lines.join("\n") +
          `\n\nBecause at least one URL has been confirmed dangerous, the verdict MUST be "SCAM" and danger_level MUST be "High". Mention in the explanation that the link has been confirmed dangerous by security databases.`;
      } else if (anyDown) {
        const downNames: string[] = [];
        if (sbRes.status === "timeout" || sbRes.status === "error") downNames.push("Google Safe Browsing");
        if (vtRes.status === "timeout" || vtRes.status === "error") downNames.push("VirusTotal");
        urlEvidence = `\n\nURL REPUTATION RESULTS: ${downNames.join(" and ")} did not respond in time for this check. DO NOT tell the user the link is safe on that basis. Judge the message on its wording, sender, urgency, and the URL pattern (domain spelling, TLD, lookalikes). If in doubt, lean toward "LIKELY SCAM" and clearly advise the senior not to click the link until it can be re-checked.`;
      } else if (sbRes.status === "ok" || vtRes.status === "ok") {
        urlEvidence = `\n\nURL REPUTATION RESULTS: The URL(s) in this message are not currently flagged by Google Safe Browsing or VirusTotal. This does NOT prove they are safe — brand-new scam sites may not be listed yet. Continue analyzing the URL pattern, domain, and message context.`;
      }
    }

    // Build user message — supports text, image, or both (multimodal)
    const userContent: any[] = [];
    const textPart = hasMessage
      ? `Please diagnose this suspicious content for a Canadian senior:\n\n"""${message.slice(0, 6000)}"""${urlEvidence}`
      : `Please diagnose the screenshot below for a Canadian senior. Read every word visible in the image (sender name, phone number, URL, message body, buttons). If the image contains a QR code — especially on a parking meter, pay station, parcel notice, or sticker that looks added on top of existing text — treat it as likely Quishing (QR-code phishing) and warn the user not to scan it. Use the Canadian scam playbook to give a clear verdict.${urlEvidence}`;
    userContent.push({ type: "text", text: textPart });
    if (hasImage) {
      userContent.push({ type: "image_url", image_url: { url: image } });
    }

    // 2. Send to Gemini Pro for full diagnosis
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                    enum: ["SCAM", "LIKELY SCAM", "LOOKS SAFE"],
                  },
                  scam_type: {
                    type: "string",
                    description: "Specific type, e.g. 'CRA Impersonation Scam', 'Grandparent Scam', 'Interac e-Transfer Phishing', 'Bank Fraud Alert Scam'. If safe, use 'No Scam Detected'.",
                  },
                  danger_level: {
                    type: "string",
                    enum: ["High", "Medium", "Low"],
                  },
                  explanation: {
                    type: "string",
                    description: "2-4 plain-English sentences explaining WHY. Warm, reassuring, like a doctor's diagnosis.",
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
                    description: "2 to 4 very short, specific reasons for this risk level, each quoting or naming the exact detail seen (e.g. 'Threatens arrest if you don't pay today', 'Link is cra-secure-pay.com, not canada.ca'). Plain English, no jargon.",
                    minItems: 2,
                    maxItems: 4,
                  },
                  stop: {
                    type: "string",
                    description: "One calm sentence: what to stop doing right now (e.g. don't click, don't reply, don't send money).",
                  },
                  verify: {
                    type: "string",
                    description: "One calm sentence: how to verify independently — look up the real organization's number on their official website, never a number from the message.",
                  },
                  call: {
                    type: "string",
                    description: "One calm sentence: who to call — the real organization from its official website, a trusted family member, and the Canadian Anti-Fraud Centre at 1-888-495-8501 if money or personal information was already shared.",
                  },
                  impersonation: {
                    type: "boolean",
                    description: "True when this involves someone pretending to be a person or organization the reader trusts — including grandparent/family emergency scams, AI voice cloning, bank, police, CRA or delivery impersonation.",
                  },
                },
                required: ["verdict", "scam_type", "danger_level", "explanation", "what_to_do", "red_flags", "stop", "verify", "call", "impersonation"],

                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "diagnose_message" } },
      }),
    });

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
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Could not analyze right now." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No diagnosis returned");
    const diagnosis = JSON.parse(toolCall.function.arguments);

    // Attach evidence so the UI can show source badges and fallback messaging
    diagnosis.url_check = {
      checked: urls.length > 0 && (sbRes.status !== "no_key" || vtRes.status !== "no_key"),
      urls_found: urls,
      confirmed_threats: threats,
      virustotal_threats: vtThreats,
      sources: {
        safe_browsing: sbRes.status,
        virustotal: vtRes.status,
      },
    };

    if (remainingToday !== null) {
      diagnosis.free_checks = { remaining: remainingToday, limit: FREE_DAILY_LIMIT };
    }



    return new Response(JSON.stringify(diagnosis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-scam error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
