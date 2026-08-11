import { createFileRoute } from "@tanstack/react-router";

// Called weekly by the scheduler. Scans news feeds and queues new scam alerts
// for approval. Authenticated with a private scheduler token that is never
// shipped to browsers (the public anon key is NOT accepted here).
export const Route = createFileRoute("/api/public/hooks/refresh-scam-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = (
          request.headers.get("x-refresh-token") ||
          (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
        ).trim();
        const expected = (process.env["SCAM_ALERT_REFRESH_TOKEN"] || "").trim();
        if (!expected || !provided || provided.length !== expected.length || provided !== expected) {
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
