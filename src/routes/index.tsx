import { createFileRoute } from "@tanstack/react-router";
import { Stethoscope, ShieldCheck } from "lucide-react";
import { FraudChecker } from "@/components/FraudChecker";
import { RecentScams } from "@/components/RecentScams";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Fraud Doctor — Scam Detector for Canadians" },
      { name: "description", content: "Paste a suspicious message, email, or link. The Fraud Doctor checks it instantly and tells you in plain English if it's a scam." },
      { property: "og:title", content: "Fraud Doctor — Scam Detector" },
      { property: "og:description", content: "A friendly scam checker for seniors and families in Canada." },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-10 md:py-16">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-gold flex items-center justify-center">
              <Stethoscope className="h-8 w-8 md:h-9 md:w-9 text-navy" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm md:text-base text-gold uppercase tracking-widest font-semibold">Trusted Diagnosis</p>
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">The Fraud Doctor</h1>
            </div>
          </div>
          <p className="text-xl md:text-2xl text-navy-foreground/90 max-w-3xl leading-relaxed">
            Paste a suspicious message below and I'll check it for you.
          </p>
          <div className="mt-5 flex items-center gap-2 text-base md:text-lg text-navy-foreground/70">
            <ShieldCheck className="h-5 w-5 text-gold" />
            <span>Free • Private • Made for Canadians</span>
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
            <Stethoscope className="h-5 w-5 text-gold" />
            <span className="font-semibold text-navy-foreground">The Fraud Doctor</span>
          </div>
          <p>Vancouver, BC &nbsp;•&nbsp; <a className="text-gold hover:underline" href="mailto:hello@thefrauddoctor.ca">hello@thefrauddoctor.ca</a></p>
          <p className="mt-3 text-sm opacity-70">Educational tool. Always verify by calling the organization directly using a number from their official website.</p>
        </div>
      </footer>
    </div>
  );
}
