// Server-only: translates approved scam alerts into the visitor's language and
// caches each translation on the alert row so the AI only runs once per language.
import type { Lang } from "@/lib/i18n";

export type AlertTranslation = { title: string; source_label: string; body: string };
export type TranslationMap = Record<string, AlertTranslation>;

const LANG_NAMES: Record<string, string> = {
  "zh-Hant": "Traditional Chinese (as used by Cantonese-speaking seniors in Vancouver)",
  "zh-Hans": "Simplified Chinese",
  pa: "Punjabi (Gurmukhi script)",
};

function cleanText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : fallback;
}

export async function translateAlertsForLang(lang: Lang, ids: string[]): Promise<TranslationMap> {
  if (lang === "en" || ids.length === 0) return {};
  const langName = LANG_NAMES[lang];
  if (!langName) return {};

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("scam_alerts")
    .select("id, title, source_label, body, translations")
    .in("id", ids)
    .eq("status", "approved");
  if (error || !rows) return {};

  const out: TranslationMap = {};
  const missing: { id: string; title: string; source_label: string; body: string }[] = [];

  for (const row of rows as unknown as {
    id: string;
    title: string;
    source_label: string;
    body: string;
    translations: Record<string, AlertTranslation> | null;
  }[]) {
    const cached = row.translations?.[lang];
    if (cached && typeof cached.body === "string" && cached.body.trim().length > 0) {
      out[row.id] = {
        title: cleanText(cached.title, row.title),
        source_label: cleanText(cached.source_label, row.source_label),
        body: cleanText(cached.body, row.body),
      };
    } else {
      missing.push({ id: row.id, title: row.title, source_label: row.source_label, body: row.body });
    }
  }

  if (missing.length === 0) return out;

  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) return out;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            `You translate Canadian scam alerts for seniors into ${langName}. Keep the warm, calm, plain tone a trusted family doctor would use. Translate every field, including the short source label. Keep well-known Canadian names and acronyms (CRA, RCMP, Interac, Service Canada) recognisable — you may keep them in English or add the English in brackets. Do not add, remove or soften any factual detail. Return one translation per supplied alert id.`,
        },
        {
          role: "user",
          content: JSON.stringify(missing),
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_translations",
            description: "Return the translated alerts.",
            parameters: {
              type: "object",
              properties: {
                translations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      source_label: { type: "string" },
                      body: { type: "string" },
                    },
                    required: ["id", "title", "source_label", "body"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["translations"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_translations" } },
    }),
  });

  if (!response.ok) return out;

  let translated: { id: string; title: string; source_label: string; body: string }[] = [];
  try {
    const payload = (await response.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? (JSON.parse(args) as { translations?: unknown }) : {};
    if (Array.isArray(parsed.translations)) {
      translated = parsed.translations as typeof translated;
    }
  } catch {
    return out;
  }

  for (const item of translated) {
    const original = missing.find((m) => m.id === item.id);
    if (!original) continue;
    const value: AlertTranslation = {
      title: cleanText(item.title, original.title),
      source_label: cleanText(item.source_label, original.source_label),
      body: cleanText(item.body, original.body),
    };
    out[original.id] = value;
    // Cache it so the next visitor in this language needs no AI call.
    const { data: fresh } = await supabaseAdmin
      .from("scam_alerts")
      .select("translations")
      .eq("id", original.id)
      .maybeSingle();
    const existing = ((fresh?.translations ?? {}) as Record<string, AlertTranslation>) || {};
    await supabaseAdmin
      .from("scam_alerts")
      .update({ translations: { ...existing, [lang]: value } })
      .eq("id", original.id);
  }

  return out;
}
