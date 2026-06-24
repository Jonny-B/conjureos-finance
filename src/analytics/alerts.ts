// Derived spending alerts — Rocket Money's low-balance / over-budget /
// upcoming-bill / price-hike nudges, computed on demand from current state (no
// storage). In-app only; firing these when the app is closed would need Plaid
// webhooks -> an edge function -> ConjureOS notify (a backend follow-up).

import type { Account, Budget, Category, Transaction } from "../api/types";
import type { RecurringStream } from "./recurring";
import { DAY_MS, isoToMs, monthKey, maxDate } from "./dates";
import { formatCurrency } from "../lib/format";

export type AlertSeverity = "info" | "warn" | "danger";
export type AlertKind =
  | "low_balance"
  | "near_budget"
  | "over_budget"
  | "upcoming_bill"
  | "price_increase";

export interface FinanceAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
}

/** Rocket Money's default low-balance threshold. */
export const LOW_BALANCE_CENTS = 20_000; // $200
const UPCOMING_BILL_DAYS = 7;
const NEAR_BUDGET_RATIO = 0.8;

const SEVERITY_RANK: Record<AlertSeverity, number> = { danger: 0, warn: 1, info: 2 };

export function computeAlerts(opts: {
  accounts: Account[];
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
  streams: RecurringStream[];
  now?: string;
}): FinanceAlert[] {
  const reference = opts.now ?? maxDate(opts.transactions.map((t) => t.date));
  const refMonth = monthKey(reference);
  const refMs = isoToMs(reference);
  const catName = new Map(opts.categories.map((c) => [c.id, c.name]));
  const alerts: FinanceAlert[] = [];

  // Low balance on spendable accounts.
  for (const a of opts.accounts) {
    if ((a.type === "checking" || a.type === "cash") && a.balanceCents < LOW_BALANCE_CENTS) {
      alerts.push({
        id: `low_${a.id}`,
        kind: "low_balance",
        severity: "danger",
        title: `Low balance: ${a.name}`,
        message: `${a.name} is at ${formatCurrency(a.balanceCents)}, below your ${formatCurrency(LOW_BALANCE_CENTS)} alert.`,
      });
    }
  }

  // Budgets vs this month's spend.
  const spendByCat = new Map<string, number>();
  for (const t of opts.transactions) {
    if (t.amountCents >= 0) continue;
    if (monthKey(t.date) !== refMonth) continue;
    const c = t.categorization.categoryId;
    if (!c) continue;
    spendByCat.set(c, (spendByCat.get(c) ?? 0) + -t.amountCents);
  }
  for (const b of opts.budgets) {
    const spent = spendByCat.get(b.categoryId) ?? 0;
    const ratio = b.limitCents > 0 ? spent / b.limitCents : 0;
    const name = catName.get(b.categoryId) ?? "Category";
    if (ratio >= 1) {
      alerts.push({
        id: `over_${b.id}`,
        kind: "over_budget",
        severity: "danger",
        title: `Over budget: ${name}`,
        message: `You've spent ${formatCurrency(spent)} of your ${formatCurrency(b.limitCents)} ${name} budget this month.`,
      });
    } else if (ratio >= NEAR_BUDGET_RATIO) {
      alerts.push({
        id: `near_${b.id}`,
        kind: "near_budget",
        severity: "warn",
        title: `Near budget: ${name}`,
        message: `${Math.round(ratio * 100)}% of your ${name} budget used (${formatCurrency(spent)} of ${formatCurrency(b.limitCents)}).`,
      });
    }
  }

  // Upcoming recurring bills.
  for (const s of opts.streams) {
    if (s.direction !== "outflow" || s.status !== "active") continue;
    const dueIn = Math.round((isoToMs(s.nextDate) - refMs) / DAY_MS);
    if (dueIn < 0 || dueIn > UPCOMING_BILL_DAYS) continue;
    const when = dueIn === 0 ? "today" : `in ${dueIn} day${dueIn === 1 ? "" : "s"}`;
    alerts.push({
      id: `bill_${s.key}`,
      kind: "upcoming_bill",
      severity: "info",
      title: `${s.merchantName} due ${dueIn === 0 ? "today" : "soon"}`,
      message: `${s.merchantName} (${formatCurrency(Math.abs(s.avgAmountCents))}) is due ${when}.`,
    });
  }

  // Subscription / bill price hikes.
  for (const s of opts.streams) {
    if (!s.priceIncrease) continue;
    alerts.push({
      id: `price_${s.key}`,
      kind: "price_increase",
      severity: "warn",
      title: `${s.merchantName} price went up`,
      message: `${s.merchantName} last charged ${formatCurrency(Math.abs(s.lastAmountCents))}, more than its usual amount.`,
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
