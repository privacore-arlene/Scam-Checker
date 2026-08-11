import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

// Supabase beta namespace: keep a small local type so this compiles cleanly.
type OAuthResult = { data?: { redirect_url?: string; redirect_to?: string; client?: { name?: string } | null }; error?: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the session lives in localStorage, absent during SSR.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connect an app · The Fraud Doctor" },
      { name: "description", content: "Approve or decline an app that wants to use The Fraud Doctor scam checker on your behalf." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Connect an app · The Fraud Doctor" },
      { property: "og:description", content: "Approve or decline an app that wants to use The Fraud Doctor scam checker on your behalf." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!authorizationId) throw new Error("This link is missing its authorization details.");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { needsSignIn: true as const, clientName: null };
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
      return { needsSignIn: false as const, clientName: null };
    }
    return { needsSignIn: false as const, clientName: data?.client?.name ?? null };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <Shell>
      <p className="text-lg text-muted-foreground">
        We couldn't load this request: {String((error as Error)?.message ?? error)}
      </p>
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-navy/10 shadow-[var(--shadow-card)] overflow-hidden">
        <div className="bg-navy px-6 py-6 border-b-4 border-gold flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-gold" />
          <h1 className="text-2xl font-semibold text-navy-foreground">The Fraud Doctor</h1>
        </div>
        <div className="p-6 space-y-5">{children}</div>
      </div>
    </main>
  );
}

function Consent() {
  const { needsSignIn, clientName } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = clientName ?? "this app";

  async function signIn() {
    setBusy(true);
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.href });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Sign in failed. Please try again.");
    }
  }

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: err } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("We didn't get a place to send you back to. Please start again.");
      return;
    }
    window.location.href = target;
  }

  if (needsSignIn) {
    return (
      <Shell>
        <p className="text-lg md:text-xl text-navy leading-relaxed">
          Please sign in first, so we know it's really you.
        </p>
        {error && <p role="alert" className="text-lg text-danger">{error}</p>}
        <Button
          onClick={signIn}
          disabled={busy}
          size="lg"
          className="w-full text-lg py-6 bg-gold text-gold-foreground hover:bg-gold/90 font-semibold rounded-xl"
        >
          {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null} Sign in with Google
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="text-xl md:text-2xl font-semibold text-navy">Connect {name} to your account</h2>
      <p className="text-lg text-muted-foreground leading-relaxed">
        This lets {name} use the Fraud Doctor scam checker as you — checking messages, reading current scam
        alerts, and looking up how to report a scam. It cannot see your password, and you can disconnect at any time.
      </p>
      {error && <p role="alert" className="text-lg text-danger">{error}</p>}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={() => decide(true)}
          disabled={busy}
          size="lg"
          className="flex-1 text-lg py-6 bg-gold text-gold-foreground hover:bg-gold/90 font-semibold rounded-xl"
        >
          {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null} Approve
        </Button>
        <Button
          onClick={() => decide(false)}
          disabled={busy}
          variant="outline"
          size="lg"
          className="flex-1 text-lg py-6 border-2 border-navy/20 text-navy hover:bg-navy/5 rounded-xl"
        >
          Cancel connection
        </Button>
      </div>
      <p className="text-base text-muted-foreground">
        This does not change what the app itself can see or do on your behalf.
      </p>
    </Shell>
  );
}
