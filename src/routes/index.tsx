import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import fdShield from "@/assets/fd-shield.png.asset.json";

import { FraudChecker } from "@/components/FraudChecker";
import { RecentScams } from "@/components/RecentScams";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider, useLang } from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";
import { approvedAlertsQueryOptions, type ScamAlert } from "@/lib/scam-alerts";

const SITE_URL = "https://frauddoctor-care.lovable.app";

export const Route = createFileRoute("/")({
  component: Index,
  loader: () => queryClient.ensureQueryData(approvedAlertsQueryOptions()),
  head: ({ loaderData }) => {
    const alerts = (loaderData ?? []) as ScamAlert[];
    const itemListElement = alerts.map((alert, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: alert.title,
      description: alert.body,
      url: `${SITE_URL}/#alert-${alert.id}`,
    }));

    const schemas: Record<string, unknown>[] = [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Recent Scams in Canada",
        itemListElement,
      },
    ];

    return {
      meta: [
        { title: "Fraud Doctor — Scam Detector for Canadians" },
        { name: "description", content: "Paste a suspicious message, email or link. The Fraud Doctor tells you in plain English if it's a scam — free, in 4 languages." },
        { property: "og:title", content: "Fraud Doctor — Scam Detector" },
        { property: "og:description", content: "A friendly scam checker for seniors and families in Canada." },
        { property: "og:url", content: SITE_URL },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: SITE_URL }],
      scripts: schemas.map((schema) => ({
        type: "application/ld+json",
        children: JSON.stringify(schema),
      })),
    };
  },
});

function Index() {
  return (
    <LanguageProvider>
      <IndexInner />
    </LanguageProvider>
  );
}

function IndexInner() {
  const { t } = useLang();
  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors />

      <main className="mx-auto w-full max-w-[800px] px-4 sm:px-6 py-5 sm:py-8">
        {/* Compact top row: product label (+ single Beta tag) and language picker. */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base sm:text-lg font-semibold uppercase tracking-wider text-navy">
              {t("embed_label")}
            </span>
            <span className="rounded-full border border-navy/25 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-navy/70">
              {t("beta_label")}
            </span>
          </div>
          <div className="shrink-0 rounded-full bg-navy">
            <LanguageSwitcher />
          </div>
        </div>

        <FraudChecker />
      </main>
    </div>
  );
}

