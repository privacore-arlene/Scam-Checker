// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are "The Fraud Doctor", a warm, calm, reassuring expert helping seniors in Canada identify scams. You analyze suspicious messages, emails, phone scripts, or URLs and give a clear diagnosis in plain English.

RULES:
- Always provide a clear verdict. NEVER say "I cannot determine" or hedge — make a confident call.
- Use simple words. Imagine you are a trusted family doctor speaking to an 80-year-old.
- Stay calm and reassuring. Never alarming.
- Focus on Canadian context (CRA, Service Canada, Canadian banks, RCMP).
- Use the diagnose_message tool to return your structured diagnosis.`;

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Please diagnose this suspicious content:\n\n"""${message.slice(0, 4000)}"""` },
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
                    description: "Overall verdict",
                  },
                  scam_type: {
                    type: "string",
                    description: "Type of scam, e.g. 'CRA Impersonation Scam', 'Grandparent Scam', 'Bank Fraud', 'Romance Scam', 'Phishing Email'. If safe, use 'No Scam Detected'.",
                  },
                  danger_level: {
                    type: "string",
                    enum: ["High", "Medium", "Low"],
                  },
                  explanation: {
                    type: "string",
                    description: "2-3 plain-English sentences explaining WHY it looks like a scam (or why it looks safe). Warm, reassuring tone.",
                  },
                  what_to_do: {
                    type: "array",
                    items: { type: "string" },
                    description: "Exactly 3 short, simple bullet points telling the senior what to do next.",
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
