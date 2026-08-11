import { useState, useRef } from "react";
import { Stethoscope, ShieldAlert, ShieldCheck, ShieldQuestion, Loader2, ExternalLink, AlertTriangle, BadgeCheck, ImagePlus, X, Clock, PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import fdShield from "@/assets/fd-shield.png.asset.json";

const DEVICE_KEY = "fd_device_id";

/** Anonymous, per-browser id used only to count free daily checks. */
function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

type LimitInfo = { resets_at?: string; limit?: number };



type SourceStatus = "ok" | "threat" | "timeout" | "error" | "no_key";
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
    virustotal_threats?: Record<string, string>;
    sources?: { safe_browsing: SourceStatus; virustotal: SourceStatus };
  };
  free_checks?: { remaining: number; limit: number };
};


const verdictMeta: Record<Diagnosis["verdict"], { bg: string; text: string; ring: string; Icon: typeof ShieldAlert; key: "verdict_scam" | "verdict_likely" | "verdict_safe" }> = {
  SCAM: { bg: "bg-danger", text: "text-danger-foreground", ring: "ring-danger/30", Icon: ShieldAlert, key: "verdict_scam" },
  "LIKELY SCAM": { bg: "bg-warn", text: "text-warn-foreground", ring: "ring-warn/30", Icon: ShieldQuestion, key: "verdict_likely" },
  "LOOKS SAFE": { bg: "bg-safe", text: "text-safe-foreground", ring: "ring-safe/30", Icon: ShieldCheck, key: "verdict_safe" },
};

const dangerColor = (level: string) =>
  level === "High" ? "bg-danger text-danger-foreground" :
  level === "Medium" ? "bg-warn text-warn-foreground" :
  "bg-safe text-safe-foreground";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export function FraudChecker() {
  const { t, lang } = useLang();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [limitInfo, setLimitInfo] = useState<LimitInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("err_image_type"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t("err_image_size"));
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setImage(dataUrl);
    } catch {
      toast.error(t("err_image_read"));
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
      toast.error(t("err_input"));
      return;
    }
    setLoading(true);
    setResult(null);
    setLimitInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-scam", {
        body: { message: text, image, lang, device_id: getDeviceId() },
      });
      if (error) {
        // Daily free allowance used up — the backend replies 429 with details.
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.limit_reached) {
              setLimitInfo({ resets_at: body.resets_at, limit: body.limit });
              setTimeout(() => document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
              return;
            }
            if (body?.error) throw new Error(body.error);
          } catch (inner) {
            if (inner instanceof Error && inner.message) throw inner;
          }
        }
        throw error;
      }
      if ((data as any)?.limit_reached) {
        setLimitInfo({ resets_at: (data as any).resets_at, limit: (data as any).limit });
        return;
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as Diagnosis);
      setTimeout(() => document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("err_generic"));
    } finally {
      setLoading(false);
    }
  };


  return (
    <section className="w-full">
      <div className="rounded-2xl overflow-hidden bg-card shadow-[var(--shadow-card)] border border-navy/10">
        {/* Branded header band */}
        <div className="bg-navy px-6 md:px-10 py-6 md:py-8 border-b-4 border-gold">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-gold/10 border-2 border-gold flex items-center justify-center shrink-0 overflow-hidden">
              <img src={fdShield.url} alt="The Fraud Doctor shield logo" className="h-10 w-10 md:h-12 md:w-12 object-contain" />
            </div>

            <div>
              <h2 className="text-2xl md:text-3xl font-semibold text-navy-foreground">{t("check_title")}</h2>
              <p className="text-base md:text-lg text-navy-foreground/80">{t("check_sub")}</p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-10 bg-gradient-to-b from-card to-[oklch(0.99_0.005_90)]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            placeholder={t("placeholder")}
            rows={7}
            className="w-full text-lg md:text-xl p-4 rounded-xl border-2 border-navy/10 bg-background focus:outline-none focus:ring-4 focus:ring-gold/30 focus:border-gold transition resize-y"
            maxLength={4000}
          />

          {image && (
            <div className="mt-4 relative inline-block rounded-xl overflow-hidden border-2 border-navy/10 bg-muted/40 p-2">
              <img src={image} alt="Screenshot to check" className="max-h-64 rounded-lg" />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove screenshot"
                className="absolute top-3 right-3 h-9 w-9 rounded-full bg-navy text-navy-foreground hover:bg-navy/90 flex items-center justify-center shadow-lg"
              >
                <X className="h-5 w-5" />
              </button>
              <p className="text-sm text-muted-foreground mt-2 px-2">{t("screenshot_attached")}</p>
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
                className="text-base md:text-lg py-6 px-5 border-2 border-navy/20 text-navy hover:bg-navy/5 hover:border-navy/40 rounded-xl"
              >
                <ImagePlus className="mr-2 h-5 w-5" />
                {image ? t("change_screenshot") : t("add_screenshot")}
              </Button>
              <p className="text-sm text-muted-foreground self-center">{text.length}/4000 {t("chars")}</p>
            </div>
            <Button
              onClick={check}
              disabled={loading}
              size="lg"
              className="text-lg md:text-xl py-7 px-8 bg-gold text-gold-foreground hover:bg-gold/90 shadow-[var(--shadow-glow)] font-semibold rounded-xl"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("checking")}</>
              ) : (
                <><Stethoscope className="mr-2 h-5 w-5" /> {t("check_btn")}</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {limitInfo && (
        <div id="diagnosis" className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <LimitCard info={limitInfo} />
        </div>
      )}

      {result && (
        <div id="diagnosis" className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <DiagnosisCard d={result} />
          {result.free_checks && (
            <p className="mt-4 text-center text-base md:text-lg text-muted-foreground">
              {result.free_checks.remaining === 1
                ? t("free_left_one")
                : t("free_left_other").replace("{n}", String(result.free_checks.remaining))}
            </p>
          )}
        </div>
      )}

    </section>
  );
}

function LimitCard({ info }: { info: LimitInfo }) {
  const { t, lang } = useLang();
  const resetLabel = info.resets_at
    ? new Date(info.resets_at).toLocaleString(lang === "en" ? "en-CA" : lang, {
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-2xl bg-card shadow-[var(--shadow-card)] border border-navy/10 overflow-hidden ring-4 ring-gold/20">
      <div className="bg-navy text-navy-foreground p-6 md:p-8 flex items-center gap-4 border-b-4 border-gold">
        <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-gold/15 border-2 border-gold/40 flex items-center justify-center shrink-0">
          <Clock className="h-7 w-7 md:h-8 md:w-8 text-gold" strokeWidth={2.2} />
        </div>
        <h3 className="text-2xl md:text-3xl font-bold leading-tight">{t("limit_title")}</h3>
      </div>

      <div className="p-6 md:p-8 space-y-5">
        <p className="text-lg md:text-xl leading-relaxed text-foreground">{t("limit_body")}</p>

        {resetLabel && (
          <p className="text-base md:text-lg text-muted-foreground">
            {t("limit_reset")}: <span className="font-semibold text-navy">{resetLabel}</span>
          </p>
        )}

        <div className="rounded-xl border border-navy/10 bg-navy/[0.03] p-4 md:p-5">
          <p className="text-lg md:text-xl leading-relaxed text-foreground">{t("limit_urgent")}</p>
        </div>

        <a
          href="tel:18884958501"
          className="inline-flex items-center gap-2 px-6 py-4 rounded-xl bg-gold text-gold-foreground hover:bg-gold/90 text-lg md:text-xl font-semibold transition"
        >
          <PhoneCall className="h-5 w-5" />
          {t("limit_call")}
        </a>
      </div>
    </div>
  );
}


function DiagnosisCard({ d }: { d: Diagnosis }) {
  const { t } = useLang();
  const v = verdictMeta[d.verdict];
  const allThreats = { ...(d.url_check?.confirmed_threats || {}), ...(d.url_check?.virustotal_threats || {}) };
  return (
    <div className={`rounded-2xl bg-card shadow-[var(--shadow-card)] border border-navy/10 overflow-hidden ring-4 ${v.ring}`}>
      <div className={`${v.bg} ${v.text} p-6 md:p-8 flex items-center gap-4 border-b-4 border-gold/40`}>
        <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center shrink-0">
          <v.Icon className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-sm md:text-base uppercase tracking-wider opacity-80 font-medium">{t("diagnosis")}</p>
          <h3 className="text-3xl md:text-4xl font-bold leading-tight">{t(v.key)}</h3>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center px-4 py-2 rounded-full bg-navy text-navy-foreground text-base md:text-lg font-medium">
            {d.scam_type}
          </span>
          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-base md:text-lg font-medium ${dangerColor(d.danger_level)}`}>
            <AlertTriangle className="h-5 w-5" /> {t("danger")}: {d.danger_level}
          </span>
        </div>

        <div>
          <h4 className="text-xl md:text-2xl font-semibold text-navy mb-2">{t("why")}</h4>
          <p className="text-lg md:text-xl leading-relaxed text-foreground">{d.explanation}</p>
        </div>

        {d.url_check?.checked && d.url_check.urls_found.length > 0 && (() => {
          const sb = d.url_check.sources?.safe_browsing;
          const vt = d.url_check.sources?.virustotal;
          const statusLabel = (s?: SourceStatus) =>
            s === "threat" ? "⚠ threat found" :
            s === "ok" ? "✓ checked" :
            s === "timeout" ? "⏱ timed out" :
            s === "error" ? "⚠ unavailable" :
            s === "no_key" ? "— not configured" : "";
          const statusColor = (s?: SourceStatus) =>
            s === "threat" ? "text-danger" :
            s === "ok" ? "text-safe-foreground" :
            (s === "timeout" || s === "error") ? "text-warn-foreground" :
            "text-muted-foreground";
          const anyDown = sb === "timeout" || sb === "error" || vt === "timeout" || vt === "error";
          return (
            <div className="rounded-xl border border-navy/10 bg-navy/[0.03] p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-gold/10 flex items-center justify-center">
                  <BadgeCheck className="h-4 w-4 text-gold" />
                </div>
                <span className="font-semibold text-navy">{t("link_checked")}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-3">
                <span><strong>Google Safe Browsing:</strong> <span className={statusColor(sb)}>{statusLabel(sb)}</span></span>
                <span><strong>VirusTotal (90+ engines incl. Malwarebytes):</strong> <span className={statusColor(vt)}>{statusLabel(vt)}</span></span>
              </div>
              {anyDown && Object.keys(allThreats).length === 0 && (
                <p className="text-sm bg-warn/10 border border-warn/30 text-warn-foreground rounded-lg p-3 mb-3">
                  One of our security databases didn't respond in time, so this link wasn't fully verified. To be safe, don't click it until you can re-check.
                </p>
              )}
              {Object.keys(allThreats).length > 0 ? (
                <ul className="text-base space-y-1">
                  {Object.entries(allThreats).map(([url, info]) => (
                    <li key={url} className="text-danger font-medium break-all">
                      ⚠ {url} — {t("confirmed")} {String(info).replace(/_/g, " ").toLowerCase()}
                    </li>
                  ))}
                </ul>
              ) : !anyDown ? (
                <p className="text-base text-muted-foreground">{t("no_threats")}</p>
              ) : null}
            </div>
          );
        })()}

        <div>
          <h4 className="text-xl md:text-2xl font-semibold text-navy mb-3">{t("what_to_do")}</h4>
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
            href="https://antifraudcentre-centreantifraude.ca/report-signalez-eng.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-4 rounded-xl bg-navy text-navy-foreground hover:bg-navy/90 text-lg md:text-xl font-semibold transition"
          >
            {t("report_btn")}
            <ExternalLink className="h-5 w-5" />
          </a>
        </div>
      </div>
    </div>
  );
}
