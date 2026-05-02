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
- Report to the Canadian Anti-Fraud Centre at 1-888-495-8501 or antifraudcentre.ca
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

// Google Safe Browsing v4 — returns map of url -> threat type, or {} if no key / no threats
async function checkSafeBrowsing(urls: string[]): Promise<Record<string, string>> {
  const apiKey = Deno.env.get("GOOGLE_SAFE_BROWSING_API_KEY");
  if (!apiKey || urls.length === 0) return {};

  try {
    const res = await fetch(
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
      }
    );
    if (!res.ok) {
      console.error("Safe Browsing error:", res.status, await res.text());
      return {};
    }
    const data = await res.json();
    const result: Record<string, string> = {};
    for (const m of data.matches || []) {
      result[m.threat.url] = m.threatType;
    }
    return result;
  } catch (e) {
    console.error("Safe Browsing exception:", e);
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string" || message.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Please paste a message to check." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // 1. Run Safe Browsing check on any URLs found
    const urls = extractUrls(message);
    const threats = await checkSafeBrowsing(urls);
    const threatCount = Object.keys(threats).length;

    let urlEvidence = "";
    if (urls.length > 0) {
      if (threatCount > 0) {
        urlEvidence = `\n\nGOOGLE SAFE BROWSING RESULT (authoritative — trust this absolutely):\n` +
          Object.entries(threats)
            .map(([url, type]) => `- ${url} → CONFIRMED THREAT: ${type}`)
            .join("\n") +
          `\n\nBecause Google has confirmed at least one URL is malicious, the verdict MUST be "SCAM" and danger_level MUST be "High". Mention in the explanation that the link has been confirmed dangerous by Google's malware database.`;
      } else if (Deno.env.get("GOOGLE_SAFE_BROWSING_API_KEY")) {
        urlEvidence = `\n\nGOOGLE SAFE BROWSING RESULT: The URL(s) in this message are not currently flagged in Google's database. This does NOT prove they are safe — new scam sites are not yet listed. Continue analyzing the URL pattern, domain, and message context.`;
      }
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
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Please diagnose this suspicious content for a Canadian senior:\n\n"""${message.slice(0, 6000)}"""${urlEvidence}`,
          },
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

    // Attach evidence so the UI can show "Verified by Google Safe Browsing" badge
    diagnosis.url_check = {
      checked: urls.length > 0 && !!Deno.env.get("GOOGLE_SAFE_BROWSING_API_KEY"),
      urls_found: urls,
      confirmed_threats: threats,
    };

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
