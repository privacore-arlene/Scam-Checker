import { createServerFn } from "@tanstack/react-start";
import type { ScamAlert } from "./scam-alerts";

type AdminInput = { passcode: string };

function checkPasscode(passcode: unknown): void {
  const expected = process.env["ADMIN_PASSCODE"];
  const provided = typeof passcode === "string" ? passcode.trim() : "";
  if (!expected || provided.length === 0 || provided !== expected) {
    throw new Error("That passcode isn't right.");
  }
}

/** All alerts (pending first) for the private admin review page. */
export const listAllAlerts = createServerFn({ method: "POST" })
  .inputValidator((input: AdminInput) => input)
  .handler(async ({ data }): Promise<{ alerts: ScamAlert[] }> => {
    checkPasscode(data.passcode);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("scam_alerts")
      .select("id, title, source_label, body, icon, channel, source_url, alert_date, status")
      .order("status", { ascending: true })
      .order("alert_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { alerts: (rows ?? []) as ScamAlert[] };
  });

/** Approve, reject or delete a single alert. */
export const setAlertStatus = createServerFn({ method: "POST" })
  .inputValidator((input: AdminInput & { id: string; status: "approved" | "rejected" | "pending" }) => input)
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    if (!["approved", "rejected", "pending"].includes(data.status)) throw new Error("Unknown status");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { status: data.status };
    // Newly approved alerts float to the top of the public section.
    if (data.status === "approved") patch["sort_order"] = Math.floor(Date.now() / 60_000) % 2_000_000;
    const { error } = await supabaseAdmin.from("scam_alerts").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Run the news scan on demand instead of waiting for the weekly job. */
export const refreshAlertsNow = createServerFn({ method: "POST" })
  .inputValidator((input: AdminInput) => input)
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_ANON_KEY"] || "";
    const origin = process.env["VITE_APP_ORIGIN"] || "";
    const url = `${origin}/api/public/hooks/refresh-scam-alerts`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({}),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(body["error"] ?? `Scan failed (${res.status})`));
    return body;
  });
