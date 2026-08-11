import { AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alertIcon, PUBLIC_ALERT_COUNT, type ScamAlert } from "@/lib/scam-alerts";

async function fetchApprovedAlerts(): Promise<ScamAlert[]> {
  const { data, error } = await supabase
    .from("scam_alerts")
    .select("id, title, source_label, body, icon, channel, source_url, alert_date, status")
    .eq("status", "approved")
    .order("sort_order", { ascending: false })
    .order("alert_date", { ascending: false })
    .limit(PUBLIC_ALERT_COUNT);
  if (error) throw error;
  return (data ?? []) as ScamAlert[];
}

export function RecentScams() {
  const { data: alerts = [] } = useQuery({
    queryKey: ["scam-alerts", "approved"],
    queryFn: fetchApprovedAlerts,
    staleTime: 5 * 60 * 1000,
  });

  if (alerts.length === 0) return null;

  return (
    <section className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <AlertCircle className="h-7 w-7 text-gold" />
        <h2 className="text-2xl md:text-3xl font-semibold text-navy">Recent Scams in Canada</h2>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {alerts.map((alert) => {
          const Icon = alertIcon(alert.icon);
          return (
            <article
              key={alert.id}
              className="rounded-2xl bg-card border border-border p-6 shadow-[var(--shadow-card)] hover:-translate-y-1 transition"
            >
              <div className="h-12 w-12 rounded-full bg-navy text-gold flex items-center justify-center mb-4">
                <Icon className="h-6 w-6" />
              </div>
              <p className="text-sm text-gold font-semibold uppercase tracking-wider mb-1">{alert.source_label}</p>
              <h3 className="text-xl font-semibold text-navy mb-2">{alert.title}</h3>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">{alert.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
