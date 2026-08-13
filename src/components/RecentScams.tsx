import { AlertCircle, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { alertIcon, alertSources, approvedAlertsQueryOptions } from "@/lib/scam-alerts";
import { getAlertTranslations } from "@/lib/alert-translations.functions";
import { useLang } from "@/lib/i18n";

export function RecentScams() {
  const { lang, t } = useLang();
  const { data: alerts = [] } = useQuery(approvedAlertsQueryOptions());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fetchTranslations = useServerFn(getAlertTranslations);
  const ids = alerts.map((a) => a.id);
  const { data: translated } = useQuery({
    queryKey: ["scam-alerts", "translations", lang, ids],
    queryFn: () => fetchTranslations({ data: { lang, ids } }),
    enabled: mounted && lang !== "en" && ids.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  const translations = translated?.translations ?? {};

  return (
    <section className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <AlertCircle className="h-7 w-7 text-gold" />
        <h2 className="text-2xl md:text-3xl font-semibold text-navy">{t("recent_title")}</h2>
      </div>

      {mounted && alerts.length > 0 && (
        <div className="grid gap-5 md:grid-cols-3">
          {alerts.map((alert) => {
            const Icon = alertIcon(alert.icon);
            const sources = alertSources(alert);
            const tr = translations[alert.id];
            return (
              <article
                key={alert.id}
                className="rounded-2xl bg-card border border-border p-6 shadow-[var(--shadow-card)] hover:-translate-y-1 transition"
              >
                <div className="h-12 w-12 rounded-full bg-navy text-gold flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <p className="text-sm text-gold font-semibold uppercase tracking-wider mb-1">
                  {tr?.source_label ?? alert.source_label}
                </p>
                <h3 className="text-xl font-semibold text-navy mb-2">{tr?.title ?? alert.title}</h3>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">{tr?.body ?? alert.body}</p>

                {sources.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm font-semibold uppercase tracking-wider text-navy/70 mb-2">{t("sources")}</p>
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
      )}
    </section>
  );
}
