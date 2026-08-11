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

export type ScamAlert = {
  id: string;
  title: string;
  source_label: string;
  body: string;
  icon: string;
  channel: string;
  source_url: string | null;
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

/** How many approved alerts the public section shows. */
export const PUBLIC_ALERT_COUNT = 3;
