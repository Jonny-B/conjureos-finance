import type { Cents, ISODate } from "../api/types";

export function formatCurrency(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Compact form for chart axes / tight spaces, e.g. -$1.2k. */
export function formatCompact(cents: Cents): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatDate(iso: ISODate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function todayISO(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

/** First day of the month `monthsBack` months ago. */
export function monthsAgoISO(monthsBack: number): ISODate {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack, 1);
  return d.toISOString().slice(0, 10);
}
