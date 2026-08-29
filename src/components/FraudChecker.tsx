import { useState, useRef, useEffect, useCallback } from "react";
import { Stethoscope, ShieldAlert, ShieldCheck, ShieldQuestion, Loader2, ExternalLink, AlertTriangle, Clock, PhoneCall, Hand, Search, Users, Mail, Link2, RotateCcw, Info, ArrowRight, Send, ClipboardList, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import fdShield from "@/assets/fd-shield.png.asset.json";
import text7726Guide from "@/assets/report-7726-howto.png.asset.json";
import emailGuide from "@/assets/report-email-howto.png.asset.json";


/** Where the soft CTAs send people next. */
const READINESS_URL = "https://www.thefrauddoctor.ca/fraud-readiness-check";
const KITS_URL = "https://www.thefrauddoctor.ca/protection-kits";


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
type NetLimitInfo = { reason?: string };

/** Public Cloudflare Turnstile site key (safe in the browser). */
const TURNSTILE_SITE_KEY = "0x4AAAAAAEOiDcGMzub9py6o";
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** App language → Turnstile language code (falls back to auto when unsupported). */
const TURNSTILE_LANGS: Record<string, string> = { en: "en", fr: "fr", "zh-Hans": "zh-cn" };

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if ((window as any).turnstile) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile")));
      return;
    }
    const el = document.createElement("script");
    el.src = TURNSTILE_SCRIPT;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(el);
  });
}





type SourceStatus =
  | "google_web_risk"
  | "ok"
  | "threat"
  | "timeout"
  | "error"
  | "no_key"
  | "disabled";
type Verdict = "HIGH RISK" | "BE CAREFUL" | "NO KNOWN WARNING FOUND";
type Diagnosis = {
  verdict: Verdict;
  scam_type: string;
  danger_level: "High" | "Medium" | "Low";
  explanation: string;
  what_to_do: string[];
  red_flags?: string[];
  stop?: string | string[];
  verify?: string | string[];
  call?: string | string[];
  verification_needed?: boolean;
  impersonation?: boolean;

  url_check?: {
    checked: boolean;
    urls_found: string[];
    confirmed_threats?: Record<string, string | string[]>;
    sources?: { link_reputation: SourceStatus };
  };
  free_checks?: { remaining: number; limit: number };
};

// Older/unexpected verdicts are folded into the three consumer findings.
// "Looks safe" is never shown to a user.
const normalizeVerdict = (raw: string | undefined): Verdict => {
  const v = String(raw || "").toUpperCase().trim();
  if (v === "HIGH RISK" || v === "SCAM") return "HIGH RISK";
  if (v === "NO KNOWN WARNING FOUND" || v.includes("SAFE")) return "NO KNOWN WARNING FOUND";
  return "BE CAREFUL";
};

const asLines = (value: string | string[] | undefined, fallback: string): string[] => {
  if (Array.isArray(value)) {
    const lines = value.map((l) => String(l).trim()).filter(Boolean);
    if (lines.length) return lines;
  } else if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return fallback ? [fallback] : [];
};

const verdictMeta: Record<Verdict, { bg: string; text: string; ring: string; Icon: typeof ShieldAlert; key: "verdict_high" | "verdict_careful" | "verdict_none"; subKey: "verdict_high_sub" | "verdict_careful_sub" | "verdict_none_sub" }> = {
  "HIGH RISK": { bg: "bg-danger", text: "text-danger-foreground", ring: "ring-danger/30", Icon: ShieldAlert, key: "verdict_high", subKey: "verdict_high_sub" },
  "BE CAREFUL": { bg: "bg-warn", text: "text-warn-foreground", ring: "ring-warn/30", Icon: ShieldQuestion, key: "verdict_careful", subKey: "verdict_careful_sub" },
  "NO KNOWN WARNING FOUND": { bg: "bg-muted", text: "text-foreground", ring: "ring-border", Icon: ShieldCheck, key: "verdict_none", subKey: "verdict_none_sub" },
};

/** Low danger is styled as a caution, never as a favourable "safe" result. */
const dangerColor = (level: string) =>
  level === "High" ? "bg-danger text-danger-foreground" :
  level === "Medium" ? "bg-warn text-warn-foreground" :
  "bg-muted text-foreground";

export function FraudChecker() {
  const { t, lang } = useLang();
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [limitInfo, setLimitInfo] = useState<LimitInfo | null>(null);
  const [netLimit, setNetLimit] = useState<NetLimitInfo | null>(null);
  const [tsToken, setTsToken] = useState("");
  const [tsFailed, setTsFailed] = useState(false);

  const tsRef = useRef<HTMLDivElement>(null);
  const tsWidgetId = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  /**
   * Clear the whole checker back to its empty state — message text, any pasted
   * link, and the results panel — then put the cursor back in the input.
   * Purely local: no network call is made.
   */
  const resetChecker = useCallback(() => {
    setResult(null);
    setLimitInfo(null);
    setNetLimit(null);
    setText("");
    setConsent(false);
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => textareaRef.current?.focus(), 350);
  }, []);


  // Render the Turnstile widget once, and re-render it when the language changes.
  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        const turnstile = (window as any).turnstile;
        if (cancelled || !turnstile || !tsRef.current) return;
        if (tsWidgetId.current !== null) {
          turnstile.remove(tsWidgetId.current);
          tsWidgetId.current = null;
        }
        setTsToken("");
        setTsFailed(false);
        tsWidgetId.current = turnstile.render(tsRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action: "check-scam",
          language: TURNSTILE_LANGS[lang] ?? "auto",
          theme: "light",
          callback: (token: string) => {
            setTsToken(token);
            setTsFailed(false);
          },
          "expired-callback": () => setTsToken(""),
          "timeout-callback": () => setTsToken(""),
          // Widget could not verify (for example, this host is not on the
          // Turnstile allow-list) — tell the person instead of leaving a
          // silently disabled button.
          "error-callback": () => {
            setTsToken("");
            setTsFailed(true);
          },
        });
      })
      .catch(() => {
        /* Widget unavailable — the server still refuses unverified requests. */
        setTsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  /** Tokens are single-use: always get a fresh one after an attempt. */
  const resetTurnstile = useCallback(() => {
    setTsToken("");
    const turnstile = (window as any).turnstile;
    if (turnstile && tsWidgetId.current !== null) {
      try {
        turnstile.reset(tsWidgetId.current);
      } catch {
        /* ignore */
      }
    }
  }, []);


  /**
   * Turn a fixed server error code into warm, localized wording that tells the
   * person what happened and exactly what to do next. Raw server text is never
   * shown — every known code has its own plain-English explanation.
   */
  const messageForCode = (code: unknown, fallback?: unknown): string => {
    switch (code) {
      case "turnstile_missing":
      case "turnstile_invalid":
      case "turnstile_unavailable":
        return t("err_verify");
      case "text_too_long":
      case "body_too_large":
        return t("err_too_long");
      case "invalid_body":
      case "origin_not_allowed":
        return t("err_unreadable");
      case "empty_input":
        return t("err_empty");
      case "image_disabled":
        return t("screenshot_unavailable");
      case "quota_unavailable":
      case "ai_unavailable":
      case "rate_limited":
        return t("err_busy");
      case "internal_error":
        return t("err_unexpected");
      default:
        return t("err_unexpected");
    }
  };

  const scrollToDiagnosis = () =>
    setTimeout(() => document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

  const check = async () => {
    if (text.trim().length < 5) {
      toast.error(t("err_input"));
      return;
    }
    if (!consent) {
      toast.error(t("consent_required"));
      return;
    }
    if (!tsToken) {
      toast.error(t("err_verify"));
      return;
    }
    setLoading(true);
    setResult(null);
    setLimitInfo(null);
    setNetLimit(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-scam", {
        body: { message: text, lang, device_id: getDeviceId(), turnstile_token: tsToken },
      });
      if (error) {
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.limit_reached) {
              setLimitInfo({ resets_at: body.resets_at, limit: body.limit });
              scrollToDiagnosis();
              return;
            }
            if (body?.network_limit_reached) {
              setNetLimit({ reason: body.reason });
              scrollToDiagnosis();
              return;
            }
            if (body?.code || body?.error) throw new Error(messageForCode(body.code, body.error));
          } catch (inner) {
            if (inner instanceof Error && inner.message) throw inner;
          }
        }
        throw new Error(t("err_generic"));
      }
      if ((data as any)?.limit_reached) {
        setLimitInfo({ resets_at: (data as any).resets_at, limit: (data as any).limit });
        return;
      }
      if ((data as any)?.network_limit_reached) {
        setNetLimit({ reason: (data as any).reason });
        return;
      }
      if ((data as any)?.error) throw new Error(messageForCode((data as any).code, (data as any).error));
      setResult(data as Diagnosis);
      scrollToDiagnosis();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("err_generic"));
    } finally {
      // Cloudflare tokens are single-use — always issue a fresh challenge.
      resetTurnstile();
      setLoading(false);
    }
  };


  return (
    <section className="w-full">
      <div ref={formTopRef} className="rounded-2xl overflow-hidden bg-card shadow-[var(--shadow-card)] border border-navy/10">
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
          {/* Privacy guidance shown immediately above the input. */}
          <p className="mb-4 rounded-xl border-2 border-gold/40 bg-gold/[0.06] p-4 text-base md:text-lg leading-relaxed text-foreground">
            {t("privacy_notice")}
          </p>

          <textarea
            ref={textareaRef}
            value={text}

            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            rows={7}
            className="w-full text-lg md:text-xl p-4 rounded-xl border-2 border-navy/10 bg-background focus:outline-none focus:ring-4 focus:ring-gold/30 focus:border-gold transition resize-y"
            maxLength={4000}
          />

          {/* Screenshot checking is temporarily switched off. */}
          <div className="mt-4 flex gap-3 items-start rounded-xl border border-navy/10 bg-navy/[0.03] p-4">
            <ImageOff className="h-6 w-6 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-base md:text-lg leading-relaxed text-foreground">{t("screenshot_unavailable")}</p>
          </div>

          <label className="mt-5 flex gap-3 items-start cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1.5 h-6 w-6 shrink-0 rounded border-2 border-navy/30 accent-[var(--gold,#c9a84c)]"
            />
            <span className="text-base md:text-lg leading-relaxed text-foreground">{t("consent_label")}</span>
          </label>

          <div className="mt-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <p className="text-sm text-muted-foreground self-center">{text.length}/4000 {t("chars")}</p>
            <Button
              onClick={check}
              disabled={loading || !tsToken || !consent}
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

          {/* Quick human check — keeps the free checker available to real people. */}
          <div className="mt-5">
            <p className="text-sm text-muted-foreground mb-2">{t("turnstile_label")}</p>
            <div ref={tsRef} aria-label={t("turnstile_label")} />
            {tsFailed ? (
              <p className="mt-3 max-w-xl text-base font-medium text-destructive">{t("turnstile_failed")}</p>
            ) : !tsToken ? (
              <p className="mt-3 max-w-xl text-base text-muted-foreground">{t("turnstile_hint")}</p>
            ) : null}
          </div>
        </div>
      </div>

      {limitInfo && (
        <div id="diagnosis" className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <LimitCard info={limitInfo} />
        </div>
      )}

      {netLimit && (
        <div id="diagnosis" className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="rounded-2xl border-2 border-navy/15 bg-card p-6 md:p-8 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-4">
              <Clock className="h-8 w-8 text-gold shrink-0" />
              <div>
                <h3 className="text-xl md:text-2xl font-semibold text-navy">{t("net_limit_title")}</h3>
                <p className="mt-2 text-lg text-foreground/80 leading-relaxed">{t("net_limit_body")}</p>
                <p className="mt-3 text-lg text-foreground/80 leading-relaxed">{t("limit_urgent")}</p>
              </div>
            </div>
          </div>
        </div>
      )}


      {result && (
        <div id="diagnosis" className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <DiagnosisCard d={result} onCheckAnother={resetChecker} />
          {result.free_checks && (
            <p className="text-center text-base md:text-lg text-muted-foreground">
              {result.free_checks.remaining === 1
                ? t("free_left_one")
                : t("free_left_other").replace("{n}", String(result.free_checks.remaining))}
            </p>
          )}

          <LeadCapture d={result} />
          <SoftCTAs />
          <PostCheckActions onCheckAnother={resetChecker} />
          <Disclaimer />
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


function DiagnosisCard({ d, onCheckAnother }: { d: Diagnosis; onCheckAnother: () => void }) {
  const { t } = useLang();
  const verdict = normalizeVerdict(d.verdict);
  const v = verdictMeta[verdict];
  type TKey = Parameters<typeof t>[0];
  const tr = (key: string, fallback: string) => {
    const value = t(key as TKey);
    return value === key ? fallback : value;
  };
  // "Low danger" is never presented as a favourable conclusion.
  const isLow = d.danger_level === "Low";
  const dangerLabel = isLow
    ? tr("danger_few", "Few warning signs detected")
    : `${t("danger")}: ${tr(`danger_${d.danger_level.toLowerCase()}`, d.danger_level)}`;
  const highSeverity = verdict === "HIGH RISK" || d.danger_level === "High";
  return (
    <div className={`rounded-2xl bg-card shadow-[var(--shadow-card)] border border-navy/10 overflow-hidden ring-4 ${v.ring}`}>
      <div className={`${v.bg} ${v.text} p-6 md:p-8 flex items-center gap-4 border-b-4 border-gold/40`}>
        <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center shrink-0">
          <v.Icon className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-sm md:text-base uppercase tracking-wider opacity-80 font-medium">{t("diagnosis")}</p>
          <h3 className="text-3xl md:text-4xl font-bold leading-tight">{t(v.key)}</h3>
          <p className="text-lg md:text-xl leading-snug mt-1 opacity-90">{t(v.subKey)}</p>
        </div>
      </div>


      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center px-4 py-2 rounded-full bg-navy text-navy-foreground text-base md:text-lg font-medium">
            {d.scam_type}
          </span>
          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-base md:text-lg font-medium ${dangerColor(d.danger_level)}`}>
            <AlertTriangle className="h-5 w-5" /> {dangerLabel}
          </span>
        </div>

        {/* One plain sentence first; the rest of the explanation stays available. */}
        <ExplanationSummary text={d.explanation} />

        {/* Start over without leaving the top of the results. */}
        <Button
          type="button"
          onClick={onCheckAnother}
          size="lg"
          variant="outline"
          className="text-lg py-6 px-6 border-2 border-navy/20 text-navy hover:bg-navy/5 rounded-xl"
        >
          <RotateCcw className="mr-2 h-5 w-5" />
          {t("check_another")}
        </Button>

        <WhatShouldIDoNow highSeverity={highSeverity} />

        {verdict === "NO KNOWN WARNING FOUND" && (
          <p className="rounded-xl border-2 border-warn/40 bg-warn/[0.08] p-4 text-lg md:text-xl leading-relaxed text-foreground">
            {t("verdict_none_note")}
          </p>
        )}

        {verdict !== "NO KNOWN WARNING FOUND" && (
          <p className="rounded-xl border-2 border-danger/40 bg-danger/[0.06] p-4 text-lg md:text-xl font-medium leading-relaxed text-foreground">
            {t("escalate")}
          </p>
        )}

        {d.red_flags && d.red_flags.length > 0 && (
          <div className="rounded-xl border-2 border-gold/40 bg-gold/[0.06] p-4 md:p-5">
            <h4 className="text-xl md:text-2xl font-semibold text-navy mb-3">{t("red_flags")}</h4>
            <ul className="space-y-2">
              {d.red_flags.map((flag, i) => (
                <li key={i} className="flex gap-3 items-start text-lg md:text-xl text-foreground">
                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-gold shrink-0" />
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <StopVerifyCall d={d} />

        {d.impersonation && <FamilyPhrase />}


        {(d.url_check?.urls_found?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-navy/10 bg-navy/[0.03] p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-gold/10 flex items-center justify-center">
                <Link2 className="h-4 w-4 text-gold" />
              </div>
              <span className="font-semibold text-navy">{t("link_checked")}</span>
            </div>
            <ul className="text-base space-y-1 mb-3">
              {d.url_check!.urls_found.map((url) => (
                <li key={url} className="break-all text-foreground">{url}</li>
              ))}
            </ul>
            <p className="text-base text-muted-foreground">
              {Object.keys(d.url_check?.confirmed_threats ?? {}).length > 0
                ? t("wc_url_threat")
                : d.url_check?.checked ||
                    d.url_check?.sources?.link_reputation === "google_web_risk"
                  ? t("wc_url_no_match")
                  : t("no_threats")}
            </p>
          </div>
        )}

        <WhatWasChecked d={d} />

        <WhatHappened />

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

/**
 * Leads with one bolded plain sentence. The remaining explanation is kept in
 * full, just collapsed behind a "Read more" toggle.
 */
function ExplanationSummary({ text }: { text: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const clean = (text || "").trim();
  const match = clean.match(/^[\s\S]*?[.!?](\s|$)/);
  const first = (match ? match[0] : clean).trim();
  const rest = clean.slice(first.length).trim();

  return (
    <div>
      <h4 className="text-xl md:text-2xl font-semibold text-navy mb-2">{t("why")}</h4>
      <p className="text-lg md:text-xl font-semibold leading-relaxed text-foreground">{first}</p>
      {rest && (
        <>
          {open && <p className="mt-3 text-lg md:text-xl leading-relaxed text-foreground">{rest}</p>}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-2 text-base md:text-lg font-semibold text-navy underline underline-offset-4 hover:text-gold transition"
          >
            {open ? t("read_less") : t("read_more")}
          </button>
        </>
      )}
    </div>
  );
}

const DO_NOW_OPTIONS = [
  { id: "text", labelKey: "sd_opt_text", bodyKey: "sd_body_text", image: text7726Guide, altKey: "sd_img_text_alt" },
  { id: "email", labelKey: "sd_opt_email", bodyKey: "sd_body_email", image: emailGuide, altKey: "sd_img_email_alt" },
  { id: "link", labelKey: "sd_opt_link", bodyKey: "sd_body_link", image: null, altKey: null },
  { id: "call", labelKey: "sd_opt_call", bodyKey: "sd_body_call", image: null, altKey: null },
] as const;

/**
 * Simple next steps by channel. Instructions are always real text so screen
 * readers can read them aloud; the guide images are a visual supplement only.
 */
function WhatShouldIDoNow({ highSeverity }: { highSeverity: boolean }) {
  const { t } = useLang();
  type TKey = Parameters<typeof t>[0];
  const [open, setOpen] = useState<(typeof DO_NOW_OPTIONS)[number]["id"] | null>(null);

  return (
    <div className="rounded-xl border-2 border-navy/15 bg-card p-4 md:p-6">
      <h4 className="text-xl md:text-2xl font-semibold text-navy">{t("sd_title")}</h4>
      <p className="text-lg md:text-xl text-muted-foreground mt-1 mb-4">{t("sd_intro")}</p>

      <div className="space-y-3">
        {DO_NOW_OPTIONS.map((opt) => {
          const isOpen = open === opt.id;
          return (
            <div key={opt.id} className="rounded-xl border-2 border-navy/15 overflow-hidden">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : opt.id)}
                className={`w-full text-left px-4 py-4 text-lg md:text-xl font-medium transition ${
                  isOpen ? "bg-gold/10 text-navy" : "text-foreground hover:bg-navy/[0.03]"
                }`}
              >
                {t(opt.labelKey as TKey)}
              </button>
              {isOpen && (
                <div className="px-4 pb-5 pt-1 space-y-4">
                  <p className="text-lg md:text-xl leading-relaxed text-foreground">{t(opt.bodyKey as TKey)}</p>
                  {opt.image && opt.altKey && (
                    <img
                      src={opt.image.url}
                      alt={t(opt.altKey as TKey)}
                      loading="lazy"
                      className="w-full max-w-full h-auto rounded-xl border border-navy/10"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p
        className={`mt-5 rounded-xl leading-relaxed text-foreground ${
          highSeverity
            ? "border-2 border-danger bg-danger/10 p-5 text-xl md:text-2xl font-semibold"
            : "border-2 border-gold/40 bg-gold/[0.08] p-4 text-lg md:text-xl"
        }`}
      >
        {t("sd_emergency")}
      </p>
    </div>
  );
}

/**
 * Honest inventory of this screening, collapsed by default. A provider is only
 * ever described as having checked something when its request actually succeeded.
 */
function WhatWasChecked({ d }: { d: Diagnosis }) {
  const { t } = useLang();
  const urls = d.url_check?.urls_found ?? [];
  const reputation = d.url_check?.sources?.link_reputation;
  // A lookup only counts as having run when the backend says so.
  const reputationRan =
    d.url_check?.checked === true ||
    reputation === "google_web_risk" ||
    reputation === "ok" ||
    reputation === "threat";
  const threatFound =
    reputation === "threat" ||
    Object.keys(d.url_check?.confirmed_threats ?? {}).length > 0;
  const urlValue =
    urls.length === 0
      ? t("wc_no_url")
      : !reputationRan
        ? t("wc_unavailable")
        : threatFound
          ? t("wc_url_threat")
          : t("wc_url_no_match");

  const rows: { label: string; value: string }[] = [
    { label: t("wc_signs"), value: t("wc_checked") },
    { label: t("wc_url"), value: urlValue },
  ];

  return (
    <details className="rounded-xl border-2 border-navy/15 bg-navy/[0.03] p-4 md:p-6">
      <summary className="flex items-center gap-2 cursor-pointer list-none">
        <ClipboardList className="h-6 w-6 text-gold shrink-0" />
        <span className="text-xl md:text-2xl font-semibold text-navy">{t("wc_disclosure")}</span>
      </summary>
      <dl className="divide-y divide-navy/10 mt-3">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap justify-between gap-2 py-2">
            <dt className="text-lg md:text-xl text-foreground">{row.label}</dt>
            <dd className="text-lg md:text-xl font-semibold text-navy">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-base md:text-lg text-muted-foreground">{t("wc_coming_soon")}</p>
    </details>
  );
}



function StopVerifyCall({ d }: { d: Diagnosis }) {
  const { t } = useLang();
  const steps: { label: string; lines: string[]; Icon: typeof Hand }[] = [
    { label: t("fw_stop"), lines: asLines(d.stop, d.what_to_do[0] || ""), Icon: Hand },
    { label: t("fw_verify"), lines: asLines(d.verify, d.what_to_do[1] || ""), Icon: Search },
    { label: t("fw_call"), lines: asLines(d.call, d.what_to_do[2] || ""), Icon: PhoneCall },
  ].filter((s) => s.lines.length > 0);

  if (steps.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-navy/15 bg-navy/[0.03] p-4 md:p-6">
      <h4 className="text-xl md:text-2xl font-semibold text-navy mb-4">{t("fw_title")}</h4>
      <ol className="space-y-4">
        {steps.map((s) => (
          <li key={s.label} className="flex gap-4 items-start">
            <span className="shrink-0 h-11 w-11 rounded-full bg-navy text-navy-foreground flex items-center justify-center">
              <s.Icon className="h-5 w-5 text-gold" strokeWidth={2.2} />
            </span>
            <div className="pt-1 space-y-1">
              <p className="text-base md:text-lg font-bold tracking-wide text-navy">{s.label}</p>
              {s.lines.map((line, i) => (
                <p key={i} className="text-lg md:text-xl leading-relaxed text-foreground">{line}</p>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-lg border-2 border-gold bg-gold/[0.08] p-4">
        <p className="text-lg md:text-xl font-semibold text-navy leading-relaxed">{t("verify_warn_title")}</p>
        <p className="text-lg md:text-xl leading-relaxed text-foreground mt-1">{t("verify_warn_body")}</p>
      </div>
    </div>
  );
}

const WHAT_HAPPENED = [
  { id: "nothing", labelKey: "wh_opt_nothing" },
  { id: "money", labelKey: "wh_opt_money" },
  { id: "link", labelKey: "wh_opt_link" },
  { id: "shared", labelKey: "wh_opt_shared" },
] as const;

function WhatHappened() {
  const { t } = useLang();
  const [choice, setChoice] = useState<(typeof WHAT_HAPPENED)[number]["id"] | null>(null);
  const [clickedDetail, setClickedDetail] = useState<"opened" | "entered" | null>(null);

  const lines = (key: string) => t(key as Parameters<typeof t>[0]).split("\n").filter(Boolean);

  return (
    <div className="rounded-xl border-2 border-navy/15 bg-card p-4 md:p-6">
      <h4 className="text-xl md:text-2xl font-semibold text-navy">{t("wh_title")}</h4>
      <p className="text-lg md:text-xl text-muted-foreground mt-1 mb-4">{t("wh_intro")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {WHAT_HAPPENED.map((opt) => {
          const active = choice === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              onClick={() => { setChoice(opt.id); setClickedDetail(null); }}
              className={`text-left rounded-xl border-2 px-4 py-4 text-lg md:text-xl font-medium transition ${
                active ? "border-gold bg-gold/10 text-navy" : "border-navy/15 hover:border-gold/60 text-foreground"
              }`}
            >
              {t(opt.labelKey as Parameters<typeof t>[0])}
            </button>
          );
        })}
      </div>

      {choice && (
        <div className="mt-5 space-y-3">
          {choice === "money" && (
            <p className="rounded-lg bg-danger/10 border-2 border-danger/40 p-4 text-lg md:text-xl font-semibold text-foreground leading-relaxed">
              {t("wh_money_urgent")}
            </p>
          )}

          {choice === "link" ? (
            <>
              <p className="text-lg md:text-xl font-semibold text-navy">{t("wh_link_q")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {([["opened", "wh_link_only_opened"], ["entered", "wh_link_entered"]] as const).map(([id, key]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={clickedDetail === id}
                    onClick={() => setClickedDetail(id)}
                    className={`text-left rounded-xl border-2 px-4 py-3 text-lg md:text-xl font-medium transition ${
                      clickedDetail === id ? "border-gold bg-gold/10 text-navy" : "border-navy/15 hover:border-gold/60 text-foreground"
                    }`}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
              {clickedDetail && (
                <ul className="space-y-2 pt-2">
                  {lines(clickedDetail === "opened" ? "wh_link_only_body" : "wh_link_entered_body").map((line, i) => (
                    <li key={i} className="flex gap-3 items-start text-lg md:text-xl text-foreground">
                      <span className="mt-2.5 h-2.5 w-2.5 rounded-full bg-gold shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <ul className="space-y-2">
              {lines(
                choice === "nothing" ? "wh_nothing_body" : choice === "money" ? "wh_money_body" : "wh_shared_body",
              ).map((line, i) => (
                <li key={i} className="flex gap-3 items-start text-lg md:text-xl text-foreground">
                  <span className="mt-2.5 h-2.5 w-2.5 rounded-full bg-gold shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FamilyPhrase() {
  const { t } = useLang();
  return (
    <div className="rounded-xl border-2 border-gold bg-card p-4 md:p-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="h-10 w-10 rounded-full bg-gold/15 border border-gold flex items-center justify-center shrink-0">
          <Users className="h-5 w-5 text-gold" />
        </span>
        <h4 className="text-xl md:text-2xl font-semibold text-navy">{t("phrase_title")}</h4>
      </div>
      <p className="text-lg md:text-xl leading-relaxed text-foreground">{t("phrase_body")}</p>
    </div>
  );
}

function LeadCapture({ d }: { d: Diagnosis }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (cleanName.length < 1 || cleanName.length > 100) {
      toast.error(t("lead_err_name"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanEmail.length > 255) {
      toast.error(t("lead_err_email"));
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("fraud_check_leads").insert({
        name: cleanName,
        email: cleanEmail,
        lang,
        verdict: d.verdict,
        scam_type: d.scam_type,
        wants_tips: true,
      });
      if (error) throw error;
      setDone(true);
    } catch {
      toast.error(t("lead_err"));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-safe/40 bg-safe/10 p-5 md:p-7 text-center">
        <p className="text-lg md:text-xl font-medium text-foreground">{t("lead_thanks")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-navy/10 bg-card shadow-[var(--shadow-card)] p-5 md:p-7">
      <div className="flex items-start gap-3">
        <span className="h-11 w-11 rounded-full bg-navy flex items-center justify-center shrink-0">
          <Mail className="h-5 w-5 text-gold" />
        </span>
        <div className="flex-1">
          <h4 className="text-xl md:text-2xl font-semibold text-navy">{t("lead_title")}</h4>
          <p className="mt-2 text-lg md:text-xl leading-relaxed text-muted-foreground">{t("lead_body")}</p>

          {!open ? (
            <Button
              type="button"
              onClick={() => setOpen(true)}
              size="lg"
              className="mt-4 text-lg py-6 px-6 bg-gold text-gold-foreground hover:bg-gold/90 font-semibold rounded-xl"
            >
              {t("lead_btn")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block" htmlFor="lead-name">
                  <span className="block text-base md:text-lg font-medium text-navy mb-1">{t("lead_name")}</span>
                  <input
                    id="lead-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    autoComplete="given-name"
                    className="w-full text-lg p-3 rounded-xl border-2 border-navy/15 bg-background focus:outline-none focus:ring-4 focus:ring-gold/30 focus:border-gold"
                  />
                </label>
                <label className="block" htmlFor="lead-email">
                  <span className="block text-base md:text-lg font-medium text-navy mb-1">{t("lead_email")}</span>
                  <input
                    id="lead-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={255}
                    autoComplete="email"
                    className="w-full text-lg p-3 rounded-xl border-2 border-navy/15 bg-background focus:outline-none focus:ring-4 focus:ring-gold/30 focus:border-gold"
                  />
                </label>
              </div>
              <Button
                type="button"
                onClick={submit}
                disabled={sending}
                size="lg"
                className="text-lg py-6 px-6 bg-gold text-gold-foreground hover:bg-gold/90 font-semibold rounded-xl"
              >
                {sending ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("lead_sending")}</>
                ) : (
                  <><Send className="mr-2 h-5 w-5" /> {t("lead_btn")}</>
                )}
              </Button>
              <p className="text-sm md:text-base text-muted-foreground">{t("lead_privacy")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SoftCTAs() {
  const { t } = useLang();
  const cards = [
    { title: t("cta_readiness_title"), label: t("cta_readiness_btn"), href: READINESS_URL },
    { title: t("cta_kit_title"), label: t("cta_kit_btn"), href: KITS_URL },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((c) => (
        <div key={c.href} className="rounded-2xl bg-navy text-navy-foreground p-5 md:p-7 border-b-4 border-gold flex flex-col justify-between gap-4">
          <p className="text-lg md:text-xl leading-relaxed">{c.title}</p>
          <a
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-gold text-gold-foreground hover:bg-gold/90 text-lg font-semibold transition"
          >
            {c.label}
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
      ))}
    </div>
  );
}

function PostCheckActions({ onCheckAnother }: { onCheckAnother: () => void }) {
  const { t } = useLang();
  const shareUrl = typeof window !== "undefined" ? window.location.href : "https://thefrauddoctor.ca";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("share_copied"));
    } catch {
      toast.error(shareUrl);
    }
  };

  return (
    <div className="rounded-2xl border border-navy/10 bg-card p-5 md:p-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <Button
          type="button"
          onClick={onCheckAnother}
          size="lg"
          variant="outline"
          className="text-lg py-6 px-6 border-2 border-navy/20 text-navy hover:bg-navy/5 rounded-xl"
        >
          <RotateCcw className="mr-2 h-5 w-5" />
          {t("check_another")}
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="text-base md:text-lg text-muted-foreground">{t("share_title")}</span>
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={copy}
              size="lg"
              variant="outline"
              className="text-base py-5 px-4 border-2 border-navy/20 text-navy hover:bg-navy/5 rounded-xl"
            >
              <Link2 className="mr-2 h-5 w-5" />
              {t("share_copy")}
            </Button>
            <a
              href={`mailto:?subject=${encodeURIComponent("The Fraud Doctor — free scam check")}&body=${encodeURIComponent(shareUrl)}`}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-navy/20 text-navy hover:bg-navy/5 text-base font-medium transition"
            >
              <Mail className="h-5 w-5" />
              {t("share_email")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Disclaimer() {
  const { t } = useLang();
  return (
    <div className="flex gap-3 items-start rounded-xl bg-muted/50 border border-navy/10 p-4 md:p-5">
      <Info className="h-5 w-5 text-navy shrink-0 mt-1" />
      <p className="text-base md:text-lg leading-relaxed text-muted-foreground">{t("disclaimer")}</p>
    </div>
  );
}
