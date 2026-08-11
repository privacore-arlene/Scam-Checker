// Shared, browser-safe types and helpers for the "Recent Scams in Canada" section.
import {
  AlertCircle,
  Bitcoin,
  Car,
  CreditCard,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  QrCode,
  ShoppingBag,
  Users,
  Video,
} from "lucide-react";

export type SourceLink = { label: string; url: string };

export type ScamAlert = {
  id: string;
  title: string;
  source_label: string;
  body: string;
  icon: string;
  channel: string;
  source_url: string | null;
  source_links?: unknown;
  alert_date: string;
  status: string;
};

export const ALERT_ICONS = {
  AlertCircle,
  Bitcoin,
  Car,
  CreditCard,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  QrCode,
  ShoppingBag,
  Users,
  Video,
} as const;

export type AlertIconName = keyof typeof ALERT_ICONS;

export function alertIcon(name: string) {
  return ALERT_ICONS[name as AlertIconName] ?? AlertCircle;
}

/**
 * The original Canadian warning link(s) used to write an alert, cleaned up for display.
 * Falls back to the single legacy source_url when no list is stored.
 */
export function alertSources(alert: ScamAlert): SourceLink[] {
  const raw = Array.isArray(alert.source_links) ? (alert.source_links as unknown[]) : [];
  const links: SourceLink[] = [];
  const seen = new Set<string>();

  const add = (url: unknown, label: unknown) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }
    const text = typeof label === "string" && label.trim().length > 0 ? label.trim() : host || url;
    links.push({ label: text.slice(0, 120), url });
  };

  for (const entry of raw) {
    if (typeof entry === "string") add(entry, null);
    else if (entry && typeof entry === "object") {
      const o = entry as Record<string, unknown>;
      add(o["url"], o["label"]);
    }
  }
  if (links.length === 0) add(alert.source_url, alert.source_label);
  return links;
}

/** How many approved alerts the public section shows. */
export const PUBLIC_ALERT_COUNT = 3;
