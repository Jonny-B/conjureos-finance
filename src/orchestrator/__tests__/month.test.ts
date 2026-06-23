import { describe, expect, it } from "vitest";
import { parseMonthInput, resolveMonthScope, isInScope, formatScope } from "../month";
import { MockFinanceApi } from "../../api/mock/mockApi";
import { CategorizationOrchestrator } from "../categorizer";
import { HeuristicProvider } from "../inference/heuristicProvider";

describe("parseMonthInput", () => {
  it("parses ISO year-month", () => {
    expect(parseMonthInput("2026-02")).toEqual({ year: 2026, month: 2 });
    expect(parseMonthInput("2026-02-14")).toEqual({ year: 2026, month: 2 });
  });

  it("parses bare month names and abbreviations (year unknown)", () => {
    expect(parseMonthInput("February")).toEqual({ year: null, month: 2 });
    expect(parseMonthInput("feb")).toEqual({ year: null, month: 2 });
    expect(parseMonthInput("  SEPT ")).toEqual({ year: null, month: 9 });
  });

  it("parses month + year in either order, incl. 2-digit year", () => {
    expect(parseMonthInput("February 2026")).toEqual({ year: 2026, month: 2 });
    expect(parseMonthInput("2026 February")).toEqual({ year: 2026, month: 2 });
    expect(parseMonthInput("feb 26")).toEqual({ year: 2026, month: 2 });
    expect(parseMonthInput("March, 2025")).toEqual({ year: 2025, month: 3 });
  });

  it("returns null when no month is present", () => {
    expect(parseMonthInput("")).toBeNull();
    expect(parseMonthInput("everything")).toBeNull();
    expect(parseMonthInput("2026")).toBeNull();
    expect(parseMonthInput("2026-13")).toBeNull();
  });
});

describe("resolveMonthScope", () => {
  const dates = ["2024-02-10", "2025-02-03", "2026-02-21", "2026-05-01"];

  it("keeps an explicit year", () => {
    expect(resolveMonthScope("2025-02", dates)).toEqual({ year: 2025, month: 2 });
  });

  it("infers the latest year that has data in that month", () => {
    expect(resolveMonthScope("February", dates)).toEqual({ year: 2026, month: 2 });
  });

  it("falls back to the latest year overall when the month has no data", () => {
    expect(resolveMonthScope("July", dates)).toEqual({ year: 2026, month: 7 });
  });

  it("returns null for an unparseable string", () => {
    expect(resolveMonthScope("whenever", dates)).toBeNull();
  });
});

describe("isInScope / formatScope", () => {
  it("matches only the right year+month", () => {
    const scope = { year: 2026, month: 2 };
    expect(isInScope("2026-02-01", scope)).toBe(true);
    expect(isInScope("2026-02-28", scope)).toBe(true);
    expect(isInScope("2026-03-01", scope)).toBe(false);
    expect(isInScope("2025-02-01", scope)).toBe(false);
  });

  it("formats a human label", () => {
    expect(formatScope({ year: 2026, month: 2 })).toBe("February 2026");
  });
});

describe("CategorizationOrchestrator month scoping", () => {
  // Anchor so the seeded dataset deterministically spans Feb–May 2026.
  const ANCHOR = new Date("2026-05-26T00:00:00Z");

  it("scopes a run to a single month and labels it", async () => {
    const api = new MockFinanceApi(ANCHOR);
    const orch = new CategorizationOrchestrator(api, new HeuristicProvider());
    const cats = await api.listCategories();
    const all = await api.queryTransactions({ limit: 10_000 });

    const febTargets = all.items.filter(
      (t) => isInScope(t.date, { year: 2026, month: 2 }) && t.categorization.status !== "confirmed",
    );
    expect(febTargets.length).toBeGreaterThan(0);
    expect(febTargets.length).toBeLessThan(all.items.length); // there ARE other months

    const result = await orch.run(cats, all.items, { month: "February" });

    expect(result.scopeLabel).toBe("February 2026");
    expect(result.processed).toBeGreaterThan(0);
    expect(result.processed).toBeLessThanOrEqual(febTargets.length);
    expect(result.autoApplied + result.needsReview).toBe(result.processed);
  });

  it("processes more transactions with no month scope than with one", async () => {
    const cats = await new MockFinanceApi(ANCHOR).listCategories();

    const scopedApi = new MockFinanceApi(ANCHOR);
    const scoped = await new CategorizationOrchestrator(scopedApi, new HeuristicProvider()).run(
      cats,
      (await scopedApi.queryTransactions({ limit: 10_000 })).items,
      { month: "February" },
    );

    const allApi = new MockFinanceApi(ANCHOR);
    const unscoped = await new CategorizationOrchestrator(allApi, new HeuristicProvider()).run(
      cats,
      (await allApi.queryTransactions({ limit: 10_000 })).items,
    );

    expect(unscoped.scopeLabel).toBeUndefined();
    expect(unscoped.processed).toBeGreaterThan(scoped.processed);
  });
});
