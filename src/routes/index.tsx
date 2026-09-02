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
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-16">
          <div className="flex justify-end mb-4 sm:hidden">
            <LanguageSwitcher />
          </div>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex min-w-0 items-center gap-3 md:gap-4">
              <img
                src={fdShield.url}
                alt="The Fraud Doctor shield logo"
                className="h-12 w-12 md:h-16 md:w-16 shrink-0 object-contain"
              />

              <div className="min-w-0">
                <p className="text-xs sm:text-sm md:text-base text-gold uppercase tracking-widest font-semibold">{t("brand_eyebrow")}</p>
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold leading-tight">
                  {t("brand_title")}
                  <span className="block text-lg sm:text-xl md:text-2xl font-semibold text-gold mt-1">{t("brand_h1_descriptor")}</span>
                </h1>
              </div>
            </div>
            <div className="hidden sm:block shrink-0">
              <LanguageSwitcher />
            </div>
          </div>
          <p className="text-lg sm:text-xl md:text-2xl text-navy-foreground/90 max-w-3xl leading-relaxed">
            {t("hero_sub")}
          </p>
          <div className="mt-5 flex items-start gap-2 text-base md:text-lg text-navy-foreground/70">
            <ShieldCheck className="h-5 w-5 shrink-0 mt-1 text-gold" />
            <span>{t("hero_badge")}</span>
          </div>
        </div>
      </header>


      {/* Main */}
      <main className="flex-1 mx-auto max-w-5xl w-full px-4 md:px-6 py-10 md:py-14 space-y-14">
        <FraudChecker />
        <RecentScams />
      </main>

      {/* Footer */}
      <footer className="bg-navy text-navy-foreground/80 mt-8">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-8 text-center text-base md:text-lg">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src={fdShield.url} alt="" className="h-6 w-6 object-contain" />
            <span className="font-semibold text-navy-foreground">{t("brand_title")}</span>
          </div>
          <p>Vancouver, BC &nbsp;•&nbsp; <a className="text-gold hover:underline" href="tel:+16042830182">604-283-0182</a> &nbsp;•&nbsp; <a className="text-gold hover:underline" href="mailto:info@thefrauddoctor.ca">info@thefrauddoctor.ca</a></p>
          <p className="mt-3 text-sm opacity-70">{t("footer_tagline")}</p>
        </div>
      </footer>
    </div>
  );
}
