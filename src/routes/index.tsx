import { createFileRoute } from "@tanstack/react-router";

import { FraudChecker } from "@/components/FraudChecker";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider, useLang } from "@/lib/i18n";

const SITE_URL = "https://frauddoctor-care.lovable.app";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Fraud Doctor — Scam Detector for Canadians" },
      { name: "description", content: "Paste a suspicious text, email or link. The free Fraud Doctor scam checker screens it for common warning signs in plain English." },
      { property: "og:title", content: "Fraud Doctor — Scam Detector" },
      { property: "og:description", content: "A free scam checker for seniors and families in Canada." },
      { property: "og:url", content: SITE_URL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
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

