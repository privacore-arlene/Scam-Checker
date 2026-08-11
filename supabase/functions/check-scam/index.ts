// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// VirusTotal v3 — cached lookup, then submit + poll for fresh scan.
// Hard overall deadline of ~12s so a slow poll never blocks the AI diagnosis.
async function checkVirusTotal(urls: string[]): Promise<CheckResult> {
  const apiKey = Deno.env.get("VIRUSTOTAL_API_KEY");
  if (!apiKey) return { status: "no_key", threats: {} };
  if (urls.length === 0) return { status: "ok", threats: {} };

  const headers = { "x-apikey": apiKey };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + 12000;
  const timeLeft = () => Math.max(0, deadline - Date.now());

  const formatStats = (stats: any): string | null => {
    if (!stats) return null;
    const bad = (stats.malicious || 0) + (stats.suspicious || 0);
    const total = bad + (stats.harmless || 0) + (stats.undetected || 0);
    if (bad > 0) return `${bad}/${total} security vendors flagged this URL as malicious`;
    return null;
  };

  const threats: Record<string, string> = {};
  let hadFailure = false;

  await Promise.all(
    urls.map(async (url) => {
      try {
        const id = btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const cached = await fetchWithTimeout(
          `https://www.virustotal.com/api/v3/urls/${id}`,
          { headers },
          Math.min(4000, timeLeft() || 1),
        );
        if (cached.ok) {
          const data = await cached.json();
          const msg = formatStats(data?.data?.attributes?.last_analysis_stats);
          if (msg) threats[url] = msg;
          return;
        }
        if (cached.status !== 404) {
          hadFailure = true;
          console.error("VirusTotal cached lookup non-OK:", cached.status);
          return;
        }
        if (timeLeft() < 3000) return; // not enough budget to submit+poll

        const form = new URLSearchParams({ url });
        const submit = await fetchWithTimeout(
          "https://www.virustotal.com/api/v3/urls",
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
            body: form,
          },
          Math.min(4000, timeLeft()),
        );
        if (!submit.ok) { hadFailure = true; return; }
        const submitData = await submit.json();
        const analysisId = submitData?.data?.id;
        if (!analysisId) return;

        while (timeLeft() > 2500) {
          await sleep(2000);
          if (timeLeft() < 500) break;
          const poll = await fetchWithTimeout(
            `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
            { headers },
            Math.min(3000, timeLeft()),
          );
          if (!poll.ok) continue;
          const pData = await poll.json();
          if (pData?.data?.attributes?.status === "completed") {
            const msg = formatStats(pData?.data?.attributes?.stats);
            if (msg) threats[url] = msg;
            return;
          }
        }
      } catch (e) {
        hadFailure = true;
        const aborted = e instanceof Error && e.name === "AbortError";
        console.error(aborted ? "VirusTotal timeout for" : "VirusTotal exception for", url, e);
      }
    }),
  );

  if (Object.keys(threats).length > 0) return { status: "threat", threats };
  if (hadFailure) return { status: Date.now() >= deadline ? "timeout" : "error", threats };
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
const FREE_DAILY_LIMIT = 5;

// A signed-in member (real user JWT, not the public key) gets unlimited checks.
function isMember(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "authenticated" && typeof payload.sub === "string";
  } catch {
    return false;
  }
}

// Stable-ish identity: the browser's device id, falling back to caller IP.
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

async function consumeDailyCheck(
  deviceId: unknown,
  req: Request,
): Promise<{ allowed: boolean; used: number; remaining: number } | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // If the counter is unavailable, never block a worried senior from getting help.
  if (!url || !serviceKey) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/consume_daily_check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ _device_id: usageKey(deviceId, req), _limit: FREE_DAILY_LIMIT }),
    });
    if (!res.ok) {
      console.error("usage counter error", res.status, await res.text());
      return null;
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    return { allowed: !!row.allowed, used: Number(row.used) || 0, remaining: Number(row.remaining) || 0 };
  } catch (e) {
    console.error("usage counter failed", e);
    return null;
  }
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, image, lang, device_id } = await req.json();
    const LANG_NAMES: Record<string, string> = {
      en: "English",
      "zh-Hant": "Traditional Chinese (繁體中文)",
      "zh-Hans": "Simplified Chinese (简体中文)",
      pa: "Punjabi (ਪੰਜਾਬੀ, Gurmukhi script)",
    };
    const targetLang = LANG_NAMES[lang as string] || "English";
    const langInstruction = targetLang === "English"
      ? ""
      : `\n\nIMPORTANT: Write ALL output (scam_type, explanation, what_to_do steps) in ${targetLang}. Keep proper nouns like CRA, Service Canada, Interac, RBC, Canadian Anti-Fraud Centre, and phone numbers (1-888-495-8501) in their original form. Use warm, simple language an elderly speaker can easily understand.`;
    const hasMessage = typeof message === "string" && message.trim().length >= 2;
    const hasImage = typeof image === "string" && image.startsWith("data:image/");

    if (!hasMessage && !hasImage) {
      return new Response(JSON.stringify({ error: "Please paste a message or attach a screenshot." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Free daily allowance: members (signed in) are unlimited, everyone else gets FREE_DAILY_LIMIT per day.
    let remainingToday: number | null = null;
    if (!isMember(req)) {
      const gate = await consumeDailyCheck(device_id, req);
      if (gate && !gate.allowed) {
        return new Response(JSON.stringify({
          limit_reached: true,
          limit: FREE_DAILY_LIMIT,
          used: gate.used,
          resets_at: nextVancouverMidnightISO(),
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (gate) remainingToday = gate.remaining;
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
          { role: "system", content: SYSTEM_PROMPT + langInstruction },
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
                },
                required: ["verdict", "scam_type", "danger_level", "explanation", "what_to_do"],
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
