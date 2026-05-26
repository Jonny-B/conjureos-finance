// Deterministic seed data. Same output every run so the UI, charts and tests
// are stable. A contributor gets a believable multi-month dataset with zero
// backend access.

import type { Account, Budget, Category, Transaction } from "../types";

// ---- system categories -----------------------------------------------------
export const SYSTEM_CATEGORIES: Category[] = [
  { id: "cat_income", name: "Income", color: "#22c55e", icon: "💰", parentId: null, isSystem: true },
  { id: "cat_groceries", name: "Groceries", color: "#16a34a", icon: "🛒", parentId: null, isSystem: true },
  { id: "cat_dining", name: "Dining & Drinks", color: "#f97316", icon: "🍽️", parentId: null, isSystem: true },
  { id: "cat_transport", name: "Transport", color: "#3b82f6", icon: "🚗", parentId: null, isSystem: true },
  { id: "cat_shopping", name: "Shopping", color: "#a855f7", icon: "🛍️", parentId: null, isSystem: true },
  { id: "cat_bills", name: "Bills & Utilities", color: "#ef4444", icon: "🧾", parentId: null, isSystem: true },
  { id: "cat_housing", name: "Housing", color: "#8b5cf6", icon: "🏠", parentId: null, isSystem: true },
  { id: "cat_health", name: "Health", color: "#ec4899", icon: "🩺", parentId: null, isSystem: true },
  { id: "cat_entertainment", name: "Entertainment", color: "#eab308", icon: "🎬", parentId: null, isSystem: true },
  { id: "cat_travel", name: "Travel", color: "#06b6d4", icon: "✈️", parentId: null, isSystem: true },
  { id: "cat_subscriptions", name: "Subscriptions", color: "#14b8a6", icon: "🔁", parentId: null, isSystem: true },
  { id: "cat_fees", name: "Fees & Charges", color: "#64748b", icon: "💸", parentId: null, isSystem: true },
];

export const ACCOUNTS: Account[] = [
  { id: "acc_checking", name: "Everyday Checking", institution: "Conjure Bank", mask: "4821", type: "checking", balanceCents: 482_300, currency: "USD" },
  { id: "acc_credit", name: "Rewards Card", institution: "Conjure Bank", mask: "9920", type: "credit", balanceCents: -128_745, currency: "USD" },
  { id: "acc_savings", name: "Rainy Day", institution: "Conjure Bank", mask: "1142", type: "savings", balanceCents: 1_204_500, currency: "USD" },
];

// merchant -> [categoryId, account, low, high] (amounts in dollars, spend)
interface MerchantSpec {
  merchant: string;
  raw: string;
  categoryId: string;
  account: string;
  low: number;
  high: number;
  /** rough monthly frequency */
  perMonth: number;
}

const MERCHANTS: MerchantSpec[] = [
  { merchant: "Whole Foods", raw: "WHOLEFDS #103 SEATTLE WA", categoryId: "cat_groceries", account: "acc_credit", low: 24, high: 140, perMonth: 6 },
  { merchant: "Trader Joe's", raw: "TRADER JOE'S #582", categoryId: "cat_groceries", account: "acc_credit", low: 18, high: 95, perMonth: 4 },
  { merchant: "Blue Bottle Coffee", raw: "SQ *BLUE BOTTLE", categoryId: "cat_dining", account: "acc_credit", low: 4, high: 18, perMonth: 9 },
  { merchant: "Chipotle", raw: "CHIPOTLE 2240", categoryId: "cat_dining", account: "acc_credit", low: 11, high: 32, perMonth: 5 },
  { merchant: "Uber", raw: "UBER *TRIP", categoryId: "cat_transport", account: "acc_credit", low: 8, high: 44, perMonth: 7 },
  { merchant: "Shell", raw: "SHELL OIL 5742", categoryId: "cat_transport", account: "acc_credit", low: 35, high: 80, perMonth: 3 },
  { merchant: "Amazon", raw: "AMZN MKTP US*2K4F", categoryId: "cat_shopping", account: "acc_credit", low: 12, high: 180, perMonth: 8 },
  { merchant: "Target", raw: "TARGET T-1882", categoryId: "cat_shopping", account: "acc_credit", low: 20, high: 160, perMonth: 3 },
  { merchant: "Comcast", raw: "COMCAST CABLE COMM", categoryId: "cat_bills", account: "acc_checking", low: 89, high: 89, perMonth: 1 },
  { merchant: "Puget Sound Energy", raw: "PSE BILLPAY", categoryId: "cat_bills", account: "acc_checking", low: 60, high: 180, perMonth: 1 },
  { merchant: "Sunrise Apartments", raw: "SUNRISE APTS RENT", categoryId: "cat_housing", account: "acc_checking", low: 2200, high: 2200, perMonth: 1 },
  { merchant: "Walgreens", raw: "WALGREENS #4471", categoryId: "cat_health", account: "acc_credit", low: 8, high: 60, perMonth: 2 },
  { merchant: "AMC Theatres", raw: "AMC ONLINE", categoryId: "cat_entertainment", account: "acc_credit", low: 14, high: 48, perMonth: 1 },
  { merchant: "Netflix", raw: "NETFLIX.COM", categoryId: "cat_subscriptions", account: "acc_credit", low: 15.49, high: 15.49, perMonth: 1 },
  { merchant: "Spotify", raw: "SPOTIFY USA", categoryId: "cat_subscriptions", account: "acc_credit", low: 11.99, high: 11.99, perMonth: 1 },
  { merchant: "iCloud", raw: "APPLE.COM/BILL", categoryId: "cat_subscriptions", account: "acc_credit", low: 2.99, high: 9.99, perMonth: 1 },
  { merchant: "Delta Air Lines", raw: "DELTA AIR 0061", categoryId: "cat_travel", account: "acc_credit", low: 180, high: 540, perMonth: 0.4 },
  { merchant: "ATM Withdrawal", raw: "ATM WD FEE", categoryId: "cat_fees", account: "acc_checking", low: 3, high: 3, perMonth: 1 },
  // Intentionally ambiguous merchants — left for the orchestrator / review queue.
  { merchant: "SQ *THE CORNER", raw: "SQ *THE CORNER 99", categoryId: "cat_dining", account: "acc_credit", low: 9, high: 60, perMonth: 2 },
  { merchant: "PAYPAL *MKTPL", raw: "PAYPAL *MKTPLACE", categoryId: "cat_shopping", account: "acc_credit", low: 10, high: 120, perMonth: 2 },
];

// Deterministic PRNG (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS_BACK = 4;

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Builds the seed transaction set. `anchor` is "today" so the data is always
 * relative to now (tests pass a fixed anchor).
 */
export function buildSeedTransactions(anchor = new Date()): Transaction[] {
  const rand = rng(1337);
  const txns: Transaction[] = [];
  let counter = 0;

  for (let m = 0; m < MONTHS_BACK; m++) {
    const base = new Date(anchor.getFullYear(), anchor.getMonth() - m, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const maxDay = m === 0 ? Math.min(anchor.getDate(), daysInMonth) : daysInMonth;

    // monthly paycheck (income)
    for (const payDay of [1, 15]) {
      if (payDay <= maxDay) {
        txns.push(makeTxn(++counter, year, month, payDay, "Acme Corp Payroll", "ACME CORP DIR DEP", "cat_income", "acc_checking", 3200, "auto", 0.99));
      }
    }

    for (const spec of MERCHANTS) {
      const count = spec.perMonth >= 1 ? Math.round(spec.perMonth) : rand() < spec.perMonth ? 1 : 0;
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(rand() * maxDay);
        const amount = spec.low + rand() * (spec.high - spec.low);
        txns.push(makeTxn(++counter, year, month, day, spec.merchant, spec.raw, spec.categoryId, spec.account, -round2(amount), classify(spec.merchant)));
      }
    }
  }

  return txns.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Decide the seeded categorization state to demo every UI surface.
function classify(merchant: string): "auto" | "needs_review" | "uncategorized" {
  if (merchant === "SQ *THE CORNER") return "needs_review";
  if (merchant === "PAYPAL *MKTPL") return "uncategorized";
  return "auto";
}

function makeTxn(
  n: number,
  year: number,
  month: number,
  day: number,
  merchant: string,
  raw: string,
  categoryId: string,
  account: string,
  amountDollars: number,
  state: "auto" | "needs_review" | "uncategorized",
  confidence = 0.92,
): Transaction {
  const date = `${year}-${pad(month + 1)}-${pad(day)}`;
  const id = `txn_${year}${pad(month + 1)}_${pad(n)}`;
  const isIncome = categoryId === "cat_income";
  const assigned = state === "auto" ? categoryId : null;
  return {
    id,
    accountId: account,
    date,
    amountCents: Math.round(amountDollars * 100),
    merchantName: merchant,
    rawDescription: raw,
    pending: false,
    source: "mock",
    categorization: {
      categoryId: assigned,
      status: state,
      confidence: state === "auto" ? confidence : 0,
      suggestedCategoryId: state === "needs_review" ? categoryId : null,
      reasoning:
        state === "needs_review"
          ? `Merchant "${merchant}" is ambiguous — could be Dining or Shopping.`
          : null,
      orchestratorVersion: state === "auto" ? (isIncome ? "seed" : "seed") : null,
      decidedAt: state === "auto" ? `${date}T12:00:00.000Z` : null,
    },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const SEED_BUDGETS: Budget[] = [
  { id: "bud_groceries", categoryId: "cat_groceries", period: "monthly", limitCents: 60_000 },
  { id: "bud_dining", categoryId: "cat_dining", period: "monthly", limitCents: 35_000 },
  { id: "bud_shopping", categoryId: "cat_shopping", period: "monthly", limitCents: 40_000 },
  { id: "bud_transport", categoryId: "cat_transport", period: "monthly", limitCents: 25_000 },
  { id: "bud_entertainment", categoryId: "cat_entertainment", period: "monthly", limitCents: 12_000 },
];
