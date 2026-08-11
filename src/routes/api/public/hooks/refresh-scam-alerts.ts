import { createFileRoute } from "@tanstack/react-router";

// Called weekly by the scheduler. Scans news feeds and queues new scam alerts
// for approval. Authenticated with the project's public key.
export const Route = createFileRoute("/api/public/hooks/refresh-scam-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("apikey") ||
          (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_ANON_KEY"];
        if (!expected || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const { runAlertRefresh } = await import("@/lib/refresh-alerts.server");
          const result = await runAlertRefresh();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Refresh failed";
          console.error("refresh-scam-alerts failed", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
