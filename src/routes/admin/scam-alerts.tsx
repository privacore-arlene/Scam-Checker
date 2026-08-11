import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, RefreshCw, ShieldCheck, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listAllAlerts, refreshAlertsNow, setAlertStatus } from "@/lib/admin-alerts.functions";
import { alertIcon, type ScamAlert } from "@/lib/scam-alerts";

export const Route = createFileRoute("/admin/scam-alerts")({
  head: () => ({
    meta: [
      { title: "Scam Alert Review · The Fraud Doctor" },
      { name: "description", content: "Private review page for approving new Canadian scam alerts before they appear on the site." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Scam Alert Review · The Fraud Doctor" },
      { property: "og:description", content: "Private review page for approving new Canadian scam alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAlertsPage,
});

function AdminAlertsPage() {
  const load = useServerFn(listAllAlerts);
  const setStatus = useServerFn(setAlertStatus);
  const refresh = useServerFn(refreshAlertsNow);

  const [passcode, setPasscode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [alerts, setAlerts] = useState<ScamAlert[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async (code: string) => {
    const res = await load({ data: { passcode: code } });
    setAlerts(res.alerts);
  };

  const unlock = async () => {
    setBusy(true);
    try {
      await reload(passcode);
      setUnlocked(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, status: "approved" | "rejected") => {
    setBusy(true);
    try {
      await setStatus({ data: { passcode, id, status } });
      await reload(passcode);
      toast.success(status === "approved" ? "Published to your site" : "Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  const scanNow = async () => {
    setBusy(true);
    try {
      const res = await refresh({ data: { passcode } });
      await reload(passcode);
      toast.success(res.added > 0 ? `${res.added} new alert(s) found` : res.note || "Nothing new");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-card border border-navy/10 shadow-[var(--shadow-card)] overflow-hidden">
          <div className="bg-navy px-6 py-6 border-b-4 border-gold flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-gold" />
            <h1 className="text-2xl font-semibold text-navy-foreground">Scam Alert Review</h1>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-lg text-muted-foreground">Enter your admin passcode to review new alerts.</p>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
              placeholder="Admin passcode"
              className="w-full text-lg p-4 rounded-xl border-2 border-navy/10 bg-background focus:outline-none focus:ring-4 focus:ring-gold/30 focus:border-gold"
            />
            <Button
              onClick={unlock}
              disabled={busy || passcode.length === 0}
              size="lg"
              className="w-full text-lg py-6 bg-gold text-gold-foreground hover:bg-gold/90 font-semibold rounded-xl"
            >
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null} Unlock
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const pending = alerts.filter((a) => a.status === "pending");
  const approved = alerts.filter((a) => a.status === "approved");

  return (
    <main className="min-h-screen bg-background">
      <div className="bg-navy border-b-4 border-gold px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-semibold text-navy-foreground">Scam Alert Review</h1>
          <Button
            onClick={scanNow}
            disabled={busy}
            className="bg-gold text-gold-foreground hover:bg-gold/90 font-semibold rounded-xl text-base py-6 px-5"
          >
            {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}
            Check for new scams now
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-10">
        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-navy mb-4">
            Waiting for your approval ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-lg text-muted-foreground">
              Nothing waiting. The weekly check runs automatically — anything it finds shows up here.
            </p>
          ) : (
            <div className="space-y-4">
              {pending.map((a) => (
                <AlertRow key={a.id} alert={a} busy={busy} onAct={act} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-navy mb-4">
            Live on your site ({approved.length})
          </h2>
          <p className="text-base text-muted-foreground mb-4">
            The 3 most recently approved alerts appear in "Recent Scams in Canada".
          </p>
          <div className="space-y-4">
            {approved.map((a) => (
              <AlertRow key={a.id} alert={a} busy={busy} onAct={act} live />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function AlertRow({
  alert,
  busy,
  onAct,
  live = false,
}: {
  alert: ScamAlert;
  busy: boolean;
  onAct: (id: string, status: "approved" | "rejected") => void;
  live?: boolean;
}) {
  const Icon = alertIcon(alert.icon);
  return (
    <article className="rounded-2xl bg-card border border-navy/10 p-5 shadow-[var(--shadow-card)] flex flex-col md:flex-row gap-4">
      <div className="h-12 w-12 shrink-0 rounded-full bg-navy text-gold flex items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-gold font-semibold uppercase tracking-wider">{alert.source_label}</p>
        <h3 className="text-xl font-semibold text-navy">{alert.title}</h3>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed mt-1">{alert.body}</p>
        {alert.source_url && (
          <a
            href={alert.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-base text-navy underline mt-2"
          >
            Read the news story <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="flex md:flex-col gap-2 shrink-0">
        {!live && (
          <Button
            onClick={() => onAct(alert.id, "approved")}
            disabled={busy}
            className="bg-safe text-safe-foreground hover:bg-safe/90 font-semibold rounded-xl"
          >
            <Check className="mr-1 h-5 w-5" /> Publish
          </Button>
        )}
        <Button
          onClick={() => onAct(alert.id, "rejected")}
          disabled={busy}
          variant="outline"
          className="border-2 border-navy/20 text-navy hover:bg-navy/5 rounded-xl"
        >
          <Trash2 className="mr-1 h-5 w-5" /> {live ? "Take down" : "Discard"}
        </Button>
      </div>
    </article>
  );
}
