// Server-only: scans public news feeds for fresh Canadian scam warnings and
// stores AI-written, senior-friendly alerts as "pending" for admin approval.
import { ALERT_ICONS } from "@/lib/scam-alerts";

const FEEDS = [
  "https://news.google.com/rss/search?q=scam+warning+Canada+(RCMP+OR+police+OR+CRA)&hl=en-CA&gl=CA&ceid=CA:en",
  "https://news.google.com/rss/search?q=fraud+warning+seniors+(British+Columbia+OR+Vancouver)&hl=en-CA&gl=CA&ceid=CA:en",
  "https://news.google.com/rss/search?q=(text+OR+email+OR+QR+code)+scam+alert+Canada&hl=en-CA&gl=CA&ceid=CA:en",
];

type FeedItem = { title: string; link: string; published: string };

export type RefreshResult = { added: number; scanned: number; note: string };

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const block of xml.split(/<item>/i).slice(1)) {
    const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = decodeEntities(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    const published = decodeEntities(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    if (title && link) items.push({ title, link, published });
  }
  return items;
}

function fingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": "FraudDoctorBot/1.0" } });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runAlertRefresh(): Promise<RefreshResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("AI is not configured");

  // 1. Gather recent headlines about Canadian scams.
  const feedResults = await Promise.all(FEEDS.map((url) => fetchWithTimeout(url, 12_000)));
  const headlines: FeedItem[] = [];
  for (const res of feedResults) {
    if (!res || !res.ok) continue;
    headlines.push(...parseRss(await res.text()).slice(0, 12));
  }
  if (headlines.length === 0) return { added: 0, scanned: 0, note: "No headlines available right now." };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Skip anything already stored (approved, pending or rejected).
  const { data: existing } = await supabaseAdmin.from("scam_alerts").select("fingerprint");
  const seen = new Set((existing ?? []).map((r) => r.fingerprint));
  const fresh = headlines.filter((h) => !seen.has(fingerprint(h.title))).slice(0, 24);
  if (fresh.length === 0) return { added: 0, scanned: 0, note: "Nothing new since the last check." };

  // 2. Turn the headlines into plain-English alerts for seniors.
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are The Fraud Doctor, writing scam alerts for Canadian seniors. From the supplied news headlines, keep ONLY items that describe a real, specific scam or fraud currently targeting people in Canada. Discard court cases, sentencing news, opinion pieces, corporate news, and anything not actionable. For each kept item write a warm, calm, plain-English alert a 75-year-old can understand: what the scam looks like, and what to do. Never use technical jargon or alarming language. Return at most 6 items.",
        },
        {
          role: "user",
          content: fresh.map((h, i) => `${i + 1}. ${h.title} (${h.published})`).join("\n"),
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "publish_alerts",
            description: "Publish the cleaned-up Canadian scam alerts.",
            parameters: {
              type: "object",
              properties: {
                alerts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      headline_number: { type: "integer", description: "The number of the source headline used." },
                      title: { type: "string", description: "Short alert title, max 60 characters." },
                      source_label: {
                        type: "string",
                        description: "Who warned about it and when, e.g. 'Vancouver Police · Aug 2026'.",
                      },
                      body: {
                        type: "string",
                        description: "2-3 short sentences: what the scam looks like and what to do. Max 300 characters.",
                      },
                      channel: { type: "string", enum: ["text", "email", "phone", "qr", "door", "online", "other"] },
                      icon: { type: "string", enum: Object.keys(ALERT_ICONS) },
                    },
                    required: ["headline_number", "title", "source_label", "body", "channel", "icon"],
                  },
                },
              },
              required: ["alerts"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "publish_alerts" } },
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    console.error("alert refresh AI error", aiRes.status, detail.slice(0, 400));
    throw new Error(`The AI writer didn't respond (${aiRes.status}).`);
  }

  const aiJson = (await aiRes.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const args = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return { added: 0, scanned: fresh.length, note: "The AI returned nothing usable." };

  let alerts: Record<string, unknown>[] = [];
  try {
    alerts = (JSON.parse(args).alerts ?? []) as Record<string, unknown>[];
  } catch {
    return { added: 0, scanned: fresh.length, note: "The AI returned unreadable output." };
  }

  // 3. Store them as pending, waiting for admin approval.
  const iconNames = new Set(Object.keys(ALERT_ICONS));
  const today = new Date().toISOString().slice(0, 10);
  const rows = alerts
    .map((a) => {
      const source = fresh[Number(a["headline_number"]) - 1];
      const title = String(a["title"] ?? "").trim();
      if (!source || !title) return null;
      const icon = String(a["icon"] ?? "AlertCircle");
      return {
        title: title.slice(0, 120),
        source_label: String(a["source_label"] ?? "Reported in Canada").slice(0, 120),
        body: String(a["body"] ?? "").slice(0, 600),
        icon: iconNames.has(icon) ? icon : "AlertCircle",
        channel: String(a["channel"] ?? "other"),
        source_url: source.link,
        alert_date: today,
        status: "pending",
        fingerprint: fingerprint(source.title),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.body.length > 20);

  if (rows.length === 0) return { added: 0, scanned: fresh.length, note: "No alerts worth publishing this time." };

  const { error } = await supabaseAdmin
    .from("scam_alerts")
    .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true });
  if (error) {
    console.error("alert refresh insert error", error);
    throw new Error(error.message);
  }

  return { added: rows.length, scanned: fresh.length, note: "New alerts are waiting for your approval." };
}
