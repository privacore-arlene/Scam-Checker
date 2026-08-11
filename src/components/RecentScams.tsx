import { AlertCircle, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { alertIcon, alertSources, approvedAlertsQueryOptions, type ScamAlert } from "@/lib/scam-alerts";

export function RecentScams() {
  const { data: alerts = [] } = useQuery(approvedAlertsQueryOptions());

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
          const sources = alertSources(alert);
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

              {sources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm font-semibold uppercase tracking-wider text-navy/70 mb-2">Sources</p>
                  <ul className="space-y-1.5">
                    {sources.map((source) => (
                      <li key={source.url}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-start gap-1.5 text-base text-navy underline underline-offset-2 hover:text-gold"
                        >
                          <span>{source.label}</span>
                          <ExternalLink className="h-4 w-4 mt-1 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
