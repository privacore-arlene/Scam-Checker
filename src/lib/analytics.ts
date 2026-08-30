/**
 * Small, provider-agnostic analytics helper.
 *
 * It never throws and never blocks rendering. Events are forwarded to whichever
 * analytics tool happens to be loaded (PostHog, Google Analytics / gtag, or a
 * GTM dataLayer) and are always kept in a short in-page buffer so automated
 * end-to-end checks can assert on them.
 */

export type AnalyticsProps = Record<string, string | number | boolean | null>;

type TrackedEvent = { event: string; props: AnalyticsProps; at: string };

const BUFFER_LIMIT = 50;

type AnalyticsWindow = Window & {
  __fdAnalytics?: TrackedEvent[];
  posthog?: { capture?: (event: string, props?: AnalyticsProps) => void };
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
};

export function trackEvent(event: string, props: AnalyticsProps = {}): void {
  if (typeof window === "undefined") return;
  const w = window as AnalyticsWindow;
  try {
    const buffer = (w.__fdAnalytics ??= []);
    buffer.push({ event, props, at: new Date().toISOString() });
    if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);

    w.posthog?.capture?.(event, props);
    w.gtag?.("event", event, props);
    if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event, ...props });
  } catch {
    // Analytics must never break the scam checker.
  }
}

/** Read the in-page event buffer (used by automated checks). */
export function getTrackedEvents(): TrackedEvent[] {
  if (typeof window === "undefined") return [];
  return [...((window as AnalyticsWindow).__fdAnalytics ?? [])];
}
