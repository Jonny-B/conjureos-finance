import { describe, expect, it } from "vitest";
import { MockFinanceApi } from "../../api/mock/mockApi";
import { ACCOUNTS } from "../../api/mock/data";
import { detectRecurring, isSubscription, monthlyAmountCents } from "../recurring";
import { computeNetWorth } from "../networth";
import { suggestBudgets } from "../budgetSuggest";
import { computeAlerts } from "../alerts";

// Anchor so the seeded dataset deterministically spans Feb–May 2026.
const ANCHOR = new Date("2026-05-26T00:00:00Z");
const REF = "2026-05-26";

async function seed() {
  const api = new MockFinanceApi(ANCHOR);
  const [txns, cats, budgets, accounts] = await Promise.all([
    api.queryTransactions({ limit: 10_000 }).then((p) => p.items),
    api.listCategories(),
    api.listBudgets(),
    api.listAccounts(),
  ]);
  return { txns, cats, budgets, accounts };
}

describe("detectRecurring", () => {
  it("finds true subscriptions and bills, excludes habitual spend", async () => {
    const { txns } = await seed();
    const streams = detectRecurring(txns, REF);
    const names = new Set(streams.map((s) => s.merchantName));

    // True recurring merchants (monthly subscriptions + bills + rent).
    for (const m of ["Netflix", "Spotify", "Comcast", "Sunrise Apartments"]) {
      expect(names.has(m), `expected ${m} to be recurring`).toBe(true);
    }
    // Habitual / irregular spend must NOT be flagged.
    for (const m of ["Whole Foods", "Amazon", "Uber", "Blue Bottle Coffee"]) {
      expect(names.has(m), `${m} should NOT be recurring`).toBe(false);
    }
  });

  it("classifies the paycheck as a regular inflow", async () => {
    const { txns } = await seed();
    const payroll = detectRecurring(txns, REF).find((s) => s.merchantName === "Acme Corp Payroll");
    expect(payroll).toBeTruthy();
    expect(payroll!.direction).toBe("inflow");
    expect(payroll!.avgAmountCents).toBeGreaterThan(0);
    expect(payroll!.status).toBe("active");
  });

  it("marks monthly subscriptions and totals them", async () => {
    const { txns } = await seed();
    const streams = detectRecurring(txns, REF);
    const subs = streams.filter(isSubscription);
    expect(subs.map((s) => s.merchantName)).toContain("Netflix");
    expect(subs.every((s) => s.cadence === "monthly")).toBe(true);
    // Netflix is a flat $15.49/mo.
    const netflix = subs.find((s) => s.merchantName === "Netflix")!;
    expect(monthlyAmountCents(netflix)).toBe(1549);
  });
});

describe("computeNetWorth", () => {
  it("nets assets against liabilities from linked accounts", () => {
    const nw = computeNetWorth(ACCOUNTS);
    // checking 4823.00 + savings 12045.00 assets; credit -1287.45 liability.
    expect(nw.assetsCents).toBe(482_300 + 1_204_500);
    expect(nw.liabilitiesCents).toBe(128_745);
    expect(nw.netCents).toBe(482_300 + 1_204_500 - 128_745);
    expect(nw.rows.find((r) => r.type === "credit")!.isAsset).toBe(false);
  });
});

describe("suggestBudgets", () => {
  it("suggests a buffered cap per expense category from completed months", async () => {
    const { txns, cats } = await seed();
    const suggestions = suggestBudgets({ transactions: txns, categories: cats, now: REF });

    expect(suggestions.length).toBeGreaterThan(0);
    // Never suggests a budget for income.
    expect(suggestions.some((s) => s.categoryId === "cat_income")).toBe(false);
    // Buffered: suggested >= average, and a tidy multiple of $5.
    for (const s of suggestions) {
      expect(s.suggestedLimitCents).toBeGreaterThanOrEqual(s.monthlyAvgCents);
      expect(s.suggestedLimitCents % 500).toBe(0);
      expect(s.sampleMonths).toBeGreaterThan(0);
    }
  });
});

describe("computeAlerts", () => {
  it("produces severity-ordered alerts and flags over-budget categories", async () => {
    const { txns, cats, budgets, accounts } = await seed();
    const streams = detectRecurring(txns, REF);
    // Force an over-budget by setting a tiny groceries cap.
    const tightBudgets = budgets.map((b) =>
      b.categoryId === "cat_groceries" ? { ...b, limitCents: 100 } : b,
    );
    const alerts = computeAlerts({
      accounts,
      budgets: tightBudgets,
      categories: cats,
      transactions: txns,
      streams,
      now: REF,
    });

    expect(alerts.some((a) => a.kind === "over_budget" && a.title.includes("Groceries"))).toBe(true);
    // danger sorts before info.
    const rank = { danger: 0, warn: 1, info: 2 } as const;
    for (let i = 1; i < alerts.length; i++) {
      expect(rank[alerts[i].severity]).toBeGreaterThanOrEqual(rank[alerts[i - 1].severity]);
    }
  });
});
