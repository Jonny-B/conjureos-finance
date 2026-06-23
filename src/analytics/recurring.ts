// Recurring-transaction / subscription detection — the signature Rocket Money
// feature, done locally over the transaction history (no Plaid required; when
// Plaid lands, its Recurring Transactions product can replace or seed this).
//
// Two detection paths, because real charges jitter:
//   - Monthly is calendar-aware: a merchant that shows up ~once in each of
//     several months is monthly, even when the day-of-month wanders. (Raw
//     day-gap banding would miss "the 3rd one month, the 25th the next".)
//   - Sub-monthly (weekly / biweekly) needs REGULAR spacing — that's what
//     separates a fortnightly paycheck from twice-a-month pharmacy runs.
// Habitual spend (groceries, coffee, rideshare) shows up many times per month
// with irregular gaps, so it matches neither path and is correctly excluded.

import type { Transaction } from "../api/types";
import { DAY_MS, isoToMs, addDays, monthKey, maxDate } from "./dates";

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringStream {
  /** stable key (normalized merchant) */
  key: string;
  merchantName: string;
  categoryId: string | null;
  direction: "inflow" | "outflow";
  cadence: Cadence;
  intervalDays: number;
  /** signed average amount (negative = expense) */
  avgAmountCents: number;
  /** signed most-recent amount */
  lastAmountCents: number;
  lastDate: string;
  /** predicted next charge date */
  nextDate: string;
  count: number;
  status: "active" | "inactive";
  /** the latest charge is materially higher than usual on an otherwise stable stream */
  priceIncrease: boolean;
  txnIds: string[];
}

/** Representative gap per cadence — used for next-date + active math so a
 *  jittery day-of-month doesn't distort predictions. */
const REP_DAYS: Record<Cadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};
const PER_MONTH: Record<Cadence, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

const MIN_OCCURRENCES = 3;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
function cv(nums: number[]): number {
  const m = mean(nums);
  if (!m) return 1;
  return Math.sqrt(mean(nums.map((x) => (x - m) ** 2))) / m;
}

/** Decide the cadence for one merchant's sorted dates, or null if not recurring. */
function classifyCadence(dates: string[], intervals: number[]): Cadence | null {
  const distinctMonths = new Set(dates.map(monthKey)).size;
  const perMonth = distinctMonths > 0 ? dates.length / distinctMonths : 0;
  const med = median(intervals);
  const spacing = cv(intervals);

  // Monthly: present in ≥3 months, ~once each (robust to day-of-month jitter).
  if (distinctMonths >= 3 && perMonth <= 1.3) return "monthly";
  // Regular sub-monthly cadences need consistent spacing.
  if (med >= 6 && med <= 8 && spacing < 0.35) return "weekly";
  if (med >= 12 && med <= 16 && spacing < 0.35) return "biweekly";
  // Fixed-day monthly billers (clean ~30-day gaps) — backstop for the calendar path.
  if (med >= 26 && med <= 35 && spacing < 0.3) return "monthly";
  // Longer cadences (need clean gaps; rarely seen in short histories).
  if (med >= 84 && med <= 96 && spacing < 0.3) return "quarterly";
  if (med >= 350 && med <= 380 && spacing < 0.3) return "yearly";
  return null;
}

/**
 * Detect recurring streams (subscriptions, bills, paychecks) from a flat
 * transaction list. `now` is the reference "today" for active/inactive +
 * next-date math; defaults to the most recent transaction date so it's
 * deterministic against the seed dataset.
 */
export function detectRecurring(txns: Transaction[], now?: string): RecurringStream[] {
  const reference = now ?? maxDate(txns.map((t) => t.date));
  const refMs = isoToMs(reference);

  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    const arr = groups.get(t.merchantName);
    if (arr) arr.push(t);
    else groups.set(t.merchantName, [t]);
  }

  const streams: RecurringStream[] = [];
  for (const [merchant, list] of groups) {
    if (list.length < MIN_OCCURRENCES) continue;

    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const dates = sorted.map((t) => t.date);
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push(Math.round((isoToMs(dates[i]) - isoToMs(dates[i - 1])) / DAY_MS));
    }

    const cadence = classifyCadence(dates, intervals);
    if (!cadence) continue;

    const amounts = sorted.map((t) => t.amountCents);
    const last = sorted[sorted.length - 1];
    const absAmounts = amounts.map(Math.abs);
    // Only flag a price hike on an otherwise stable stream (so a variable bill
    // like a utility doesn't constantly cry wolf).
    const priceIncrease = cv(absAmounts) < 0.12 && Math.abs(last.amountCents) > median(absAmounts) * 1.1;

    const rep = REP_DAYS[cadence];
    streams.push({
      key: merchant,
      merchantName: merchant,
      categoryId: last.categorization.categoryId,
      direction: mean(amounts) >= 0 ? "inflow" : "outflow",
      cadence,
      intervalDays: rep,
      avgAmountCents: Math.round(mean(amounts)),
      lastAmountCents: last.amountCents,
      lastDate: last.date,
      nextDate: addDays(last.date, rep),
      count: list.length,
      status: refMs - isoToMs(last.date) <= 1.5 * rep * DAY_MS ? "active" : "inactive",
      priceIncrease,
      txnIds: sorted.map((t) => t.id),
    });
  }

  // Upcoming first, then by size.
  return streams.sort((a, b) =>
    a.nextDate < b.nextDate
      ? -1
      : a.nextDate > b.nextDate
        ? 1
        : Math.abs(b.avgAmountCents) - Math.abs(a.avgAmountCents),
  );
}

/** A recurring expense the user thinks of as a "subscription". */
export function isSubscription(s: RecurringStream): boolean {
  return s.direction === "outflow" && s.categoryId === "cat_subscriptions";
}

/** Normalize a stream's amount to a per-month figure for totals. */
export function monthlyAmountCents(s: RecurringStream): number {
  return Math.round(Math.abs(s.avgAmountCents) * PER_MONTH[s.cadence]);
}

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};
export function cadenceLabel(c: Cadence): string {
  return CADENCE_LABEL[c];
}
