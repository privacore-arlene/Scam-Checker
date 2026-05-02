import { useState } from "react";
import { Stethoscope, ShieldAlert, ShieldCheck, ShieldQuestion, Loader2, ExternalLink, AlertTriangle, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Diagnosis = {
  verdict: "SCAM" | "LIKELY SCAM" | "LOOKS SAFE";
  scam_type: string;
  danger_level: "High" | "Medium" | "Low";
  explanation: string;
  what_to_do: string[];
};

const verdictStyles: Record<Diagnosis["verdict"], { bg: string; text: string; ring: string; Icon: typeof ShieldAlert; label: string }> = {
  SCAM: { bg: "bg-danger", text: "text-danger-foreground", ring: "ring-danger/30", Icon: ShieldAlert, label: "This is a Scam" },
  "LIKELY SCAM": { bg: "bg-warn", text: "text-warn-foreground", ring: "ring-warn/30", Icon: ShieldQuestion, label: "Likely a Scam" },
  "LOOKS SAFE": { bg: "bg-safe", text: "text-safe-foreground", ring: "ring-safe/30", Icon: ShieldCheck, label: "Looks Safe" },
};

const dangerColor = (level: string) =>
  level === "High" ? "bg-danger text-danger-foreground" :
  level === "Medium" ? "bg-warn text-warn-foreground" :
  "bg-safe text-safe-foreground";

export function FraudChecker() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnosis | null>(null);

  const check = async () => {
    if (text.trim().length < 5) {
      toast.error("Please paste a longer message so I can check it properly.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-scam", {
        body: { message: text },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as Diagnosis);
      setTimeout(() => document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check this message right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="w-full">
      <div className="rounded-2xl bg-card shadow-[var(--shadow-card)] border border-border p-6 md:p-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-full bg-navy text-navy-foreground flex items-center justify-center">
            <Stethoscope className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold text-navy">Check a Message</h2>
            <p className="text-base md:text-lg text-muted-foreground">Paste the suspicious text, email, or website link below.</p>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Example: 'CRA NOTICE: You owe $1,247. Pay immediately at cra-secure-pay.com or face arrest.'"
          rows={7}
          className="w-full text-lg md:text-xl p-4 rounded-xl border-2 border-input bg-background focus:outline-none focus:ring-4 focus:ring-gold/30 focus:border-gold transition resize-y"
          maxLength={4000}
        />

        <div className="mt-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <p className="text-sm text-muted-foreground">{text.length}/4000 characters</p>
          <Button
            onClick={check}
            disabled={loading}
            size="lg"
            className="text-lg md:text-xl py-7 px-8 bg-gold text-gold-foreground hover:bg-gold/90 shadow-[var(--shadow-glow)] font-semibold rounded-xl"
          >
            {loading ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Checking…</>
            ) : (
              <><Stethoscope className="mr-2 h-5 w-5" /> Check This Message</>
            )}
          </Button>
        </div>
      </div>

      {result && (
        <div id="diagnosis" className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <DiagnosisCard d={result} />
        </div>
      )}
    </section>
  );
}

function DiagnosisCard({ d }: { d: Diagnosis }) {
  const v = verdictStyles[d.verdict];
  return (
    <div className={`rounded-2xl bg-card shadow-[var(--shadow-card)] border border-border overflow-hidden ring-4 ${v.ring}`}>
      <div className={`${v.bg} ${v.text} p-6 md:p-8 flex items-center gap-4`}>
        <v.Icon className="h-12 w-12 md:h-14 md:w-14 shrink-0" strokeWidth={2.2} />
        <div>
          <p className="text-sm md:text-base uppercase tracking-wider opacity-80 font-medium">Diagnosis</p>
          <h3 className="text-3xl md:text-4xl font-bold leading-tight">{v.label}</h3>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center px-4 py-2 rounded-full bg-navy text-navy-foreground text-base md:text-lg font-medium">
            {d.scam_type}
          </span>
          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-base md:text-lg font-medium ${dangerColor(d.danger_level)}`}>
            <AlertTriangle className="h-5 w-5" /> Danger: {d.danger_level}
          </span>
        </div>

        <div>
          <h4 className="text-xl md:text-2xl font-semibold text-navy mb-2">Why I think this</h4>
          <p className="text-lg md:text-xl leading-relaxed text-foreground">{d.explanation}</p>
        </div>

        <div>
          <h4 className="text-xl md:text-2xl font-semibold text-navy mb-3">What to do now</h4>
          <ul className="space-y-3">
            {d.what_to_do.map((step, i) => (
              <li key={i} className="flex gap-4 items-start text-lg md:text-xl">
                <span className="shrink-0 h-9 w-9 rounded-full bg-gold text-gold-foreground flex items-center justify-center font-bold text-lg">
                  {i + 1}
                </span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4 border-t border-border">
          <a
            href="https://www.antifraudcentre-centreantifraude.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-4 rounded-xl bg-navy text-navy-foreground hover:bg-navy/90 text-lg md:text-xl font-semibold transition"
          >
            Report this scam to the Canadian Anti-Fraud Centre
            <ExternalLink className="h-5 w-5" />
          </a>
        </div>
      </div>
    </div>
  );
}
