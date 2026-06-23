// Auto-suggest budgets from history — Rocket Money's budget wizard mechanic:
// pre-fill each expense category's monthly cap from the average of recent
// COMPLETED months (the current, partial month is excluded so the average
// isn't dragged down), plus a small buffer, rounded to a tidy figure.

import type { Category, Transaction } from "../api/types";
import { monthKey, maxDate } from "./dates";

export interface BudgetSuggestion {
  categoryId: string;
  categoryName: string;
  monthlyAvgCents: number;
  suggestedLimitCents: number;
  /** how many completed months fed the average */
  sampleMonths: number;
}

const roundTo = (cents: number, to: number): number => Math.max(to, Math.round(cents / to) * to);

export function suggestBudgets(opts: {
  transactions: Transaction[];
  categories: Category[];
  /** completed months to average over (default 3) */
  monthsBack?: number;
  /** headroom added on top of the average (default 10%) */
  bufferPct?: number;
  /** reference "today"; defaults to the most recent transaction */
  now?: string;
}): BudgetSuggestion[] {
  const monthsBack = opts.monthsBack ?? 3;
  const buffer = opts.bufferPct ?? 0.1;
  const reference = opts.now ?? maxDate(opts.transactions.map((t) => t.date));
  const refMonth = monthKey(reference);

  // category -> month -> spend (positive cents)
  const perCatMonth = new Map<string, Map<string, number>>();
  for (const t of opts.transactions) {
    if (t.amountCents >= 0) continue; // expenses only
    const cat = t.categorization.categoryId;
    if (!cat || cat === "cat_income") continue;
    const mk = monthKey(t.date);
    const months = perCatMonth.get(cat) ?? new Map<string, number>();
    months.set(mk, (months.get(mk) ?? 0) + -t.amountCents);
    perCatMonth.set(cat, months);
  }

  // The N most-recent COMPLETED months (strictly before the reference month).
  const allMonths = new Set<string>();
  for (const m of perCatMonth.values()) for (const k of m.keys()) allMonths.add(k);
  const window = [...allMonths]
    .filter((mk) => mk < refMonth)
    .sort()
    .reverse()
    .slice(0, monthsBack);

  const catName = new Map(opts.categories.map((c) => [c.id, c.name]));
  const out: BudgetSuggestion[] = [];
  for (const [cat, months] of perCatMonth) {
    let sum = 0;
    let n = 0;
    for (const mk of window) {
      const v = months.get(mk);
      if (v != null) {
        sum += v;
        n += 1;
      }
    }
    if (n === 0) continue;
    const avg = Math.round(sum / n);
    out.push({
      categoryId: cat,
      categoryName: catName.get(cat) ?? "Category",
      monthlyAvgCents: avg,
      suggestedLimitCents: roundTo(Math.round(avg * (1 + buffer)), 500),
      sampleMonths: n,
    });
  }

  return out.sort((a, b) => b.monthlyAvgCents - a.monthlyAvgCents);
}
