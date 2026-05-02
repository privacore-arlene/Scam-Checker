import { useState, useRef } from "react";
import { Stethoscope, ShieldAlert, ShieldCheck, ShieldQuestion, Loader2, ExternalLink, AlertTriangle, BadgeCheck, ImagePlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Diagnosis = {
  verdict: "SCAM" | "LIKELY SCAM" | "LOOKS SAFE";
  scam_type: string;
  danger_level: "High" | "Medium" | "Low";
  explanation: string;
  what_to_do: string[];
  url_check?: {
    checked: boolean;
    urls_found: string[];
    confirmed_threats: Record<string, string>;
  };
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

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export function FraudChecker() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPG, PNG, or screenshot).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("That image is too large. Please use one under 8 MB.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setImage(dataUrl);
    } catch {
      toast.error("Could not read that image. Please try another.");
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
          return;
        }
      }
    }
  };

  const check = async () => {
    if (!image && text.trim().length < 5) {
      toast.error("Please paste a message or attach a screenshot to check.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-scam", {
        body: { message: text, image },
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
            <p className="text-base md:text-lg text-muted-foreground">Paste the suspicious text, email, or website link — or attach a screenshot.</p>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          placeholder="Example: 'CRA NOTICE: You owe $1,247. Pay immediately at cra-secure-pay.com or face arrest.'  — or paste a screenshot here (Ctrl+V / Cmd+V)."
          rows={7}
          className="w-full text-lg md:text-xl p-4 rounded-xl border-2 border-input bg-background focus:outline-none focus:ring-4 focus:ring-gold/30 focus:border-gold transition resize-y"
          maxLength={4000}
        />

        {image && (
          <div className="mt-4 relative inline-block rounded-xl overflow-hidden border-2 border-border bg-muted/40 p-2">
            <img src={image} alt="Screenshot to check" className="max-h-64 rounded-lg" />
            <button
              type="button"
              onClick={() => setImage(null)}
              aria-label="Remove screenshot"
              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-navy text-navy-foreground hover:bg-navy/90 flex items-center justify-center shadow-lg"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-sm text-muted-foreground mt-2 px-2">Screenshot attached — I'll read it for you.</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="mt-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              className="text-base md:text-lg py-6 px-5 border-2 border-navy/20 text-navy hover:bg-navy/5 rounded-xl"
            >
              <ImagePlus className="mr-2 h-5 w-5" />
              {image ? "Change screenshot" : "Add screenshot"}
            </Button>
            <p className="text-sm text-muted-foreground self-center">{text.length}/4000 characters</p>
          </div>
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

        {d.url_check?.checked && d.url_check.urls_found.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BadgeCheck className="h-5 w-5 text-navy" />
              <span className="font-semibold text-navy">Link checked against Google Safe Browsing</span>
            </div>
            {Object.keys(d.url_check.confirmed_threats).length > 0 ? (
              <ul className="text-base space-y-1">
                {Object.entries(d.url_check.confirmed_threats).map(([url, type]) => (
                  <li key={url} className="text-danger font-medium break-all">
                    ⚠ {url} — confirmed {String(type).replace(/_/g, " ").toLowerCase()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-muted-foreground">No links in this message are currently in Google's malicious-site database. (New scam sites may not yet be listed.)</p>
            )}
          </div>
        )}

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
