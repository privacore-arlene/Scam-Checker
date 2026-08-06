import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function firstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

export default defineTool({
  name: "check_message",
  title: "Check a message for fraud",
  description:
    "Analyze a suspicious text message, email, phone script, or URL for signs of fraud targeting Canadians. Returns a verdict (SCAM, LIKELY SCAM, LOOKS SAFE), the scam type, danger level, a plain-English explanation, what to do next, and the results of live URL checks against Google Safe Browsing and VirusTotal.",
  inputSchema: {
    message: z
      .string()
      .trim()
      .min(5)
      .describe("The full suspicious message, email text, phone script, or URL to analyze."),
    lang: z
      .enum(["en", "zh-Hant", "zh-Hans", "pa"])
      .optional()
      .describe("Language for the diagnosis text. Defaults to English."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ message, lang }) => {
    const url = firstEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
    const key = firstEnv([
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "VITE_SUPABASE_ANON_KEY",
    ]);
    if (!url || !key) {
      throw new ToolError("Fraud Doctor backend is not configured.");
    }

    const response = await fetch(`${url}/functions/v1/check-scam`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ message, lang: lang ?? "en" }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new ToolError(`Fraud check failed (${response.status}): ${raw.slice(0, 500)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ToolError("Fraud check returned an unreadable response.");
    }

    const diagnosis = parsed as Record<string, unknown>;
    if (typeof diagnosis["error"] === "string") {
      throw new ToolError(String(diagnosis["error"]));
    }

    return {
      content: [{ type: "text", text: JSON.stringify(diagnosis, null, 2) }],
      structuredContent: { diagnosis },
    };
  },
});
