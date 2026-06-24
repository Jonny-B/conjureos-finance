import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildFinanceApi, type FinanceApi } from "../api";
import type { Account, Category, ManualAsset } from "../api/types";
import {
  buildOrchestrator,
  summarizeRun,
  type CategorizationOrchestrator,
  type CategorizationRunResult,
} from "../orchestrator";
import { detectRecurring, isSubscription, monthlyAmountCents } from "../analytics/recurring";
import { suggestBudgets } from "../analytics/budgetSuggest";
import { formatCurrency } from "../lib/format";
import { registerHostActions } from "../platform/host";

/** A categorization run worth announcing in the UI, tagged so repeat runs re-show. */
export interface RunAnnouncement {
  id: number;
  result: CategorizationRunResult;
  /** "orchestrator" = driven by the OS from outside; "manual" = the in-app button. */
  source: "orchestrator" | "manual";
}

interface FinanceContextValue {
  api: FinanceApi;
  orchestrator: CategorizationOrchestrator;
  categories: Category[];
  accounts: Account[];
  manualAssets: ManualAsset[];
  /** bump to force dependent views to refetch */
  revision: number;
  refresh: () => void;
  loadingMeta: boolean;
  error: string | null;
  /** Most recent categorization run, surfaced as a toast. Null once dismissed. */
  runAnnouncement: RunAnnouncement | null;
  announceRun: (result: CategorizationRunResult, source: RunAnnouncement["source"]) => void;
  dismissRun: () => void;
}

const Ctx = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => buildFinanceApi(), []);
  const orchestrator = useMemo(() => buildOrchestrator(api), [api]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [manualAssets, setManualAssets] = useState<ManualAsset[]>([]);
  const [revision, setRevision] = useState(0);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runAnnouncement, setRunAnnouncement] = useState<RunAnnouncement | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const announceRun = useCallback(
    (result: CategorizationRunResult, source: RunAnnouncement["source"]) =>
      setRunAnnouncement({ id: Date.now(), result, source }),
    [],
  );
  const dismissRun = useCallback(() => setRunAnnouncement(null), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    (async () => {
      try {
        await api.ready();
        const [cats, accs, assets] = await Promise.all([
          api.listCategories(),
          api.listAccounts(),
          api.listManualAssets(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setAccounts(accs);
        setManualAssets(assets);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, revision]);

  // Expose the categorizer to the ConjureOS orchestrator so the OS can drive it
  // ("do February's budget and categorize everything"). No-op standalone. Runs
  // once — api/orchestrator/refresh are stable for the provider's lifetime.
  useEffect(() => {
    void registerHostActions({
      categorizeTransactions: async (params) => {
        const month =
          params && typeof params === "object" && typeof (params as { month?: unknown }).month === "string"
            ? (params as { month: string }).month
            : undefined;
        await api.ready();
        const cats = await api.listCategories();
        const all = await api.queryTransactions({ limit: 10_000 });
        const result = await orchestrator.run(cats, all.items, month ? { month } : {});
        refresh();
        announceRun(result, "orchestrator");
        return { ...result, message: summarizeRun(result) };
      },

      findRecurring: async () => {
        await api.ready();
        const all = await api.queryTransactions({ limit: 10_000 });
        const streams = detectRecurring(all.items);
        const subs = streams.filter(isSubscription);
        const monthlySubs = subs.reduce((a, s) => a + monthlyAmountCents(s), 0);
        const bills = streams.filter((s) => s.direction === "outflow" && !isSubscription(s));
        return {
          subscriptionCount: subs.length,
          monthlySubscriptionsCents: monthlySubs,
          subscriptions: subs.map((s) => ({ name: s.merchantName, amountCents: Math.abs(s.avgAmountCents), cadence: s.cadence })),
          billCount: bills.length,
          message:
            subs.length === 0
              ? "No subscriptions detected yet."
              : `Found ${subs.length} subscription${subs.length === 1 ? "" : "s"} costing about ${formatCurrency(monthlySubs)}/mo, plus ${bills.length} recurring bill${bills.length === 1 ? "" : "s"}.`,
        };
      },

      buildBudgetFromHistory: async () => {
        await api.ready();
        const [all, cats] = await Promise.all([api.queryTransactions({ limit: 10_000 }), api.listCategories()]);
        const suggestions = suggestBudgets({ transactions: all.items, categories: cats });
        for (const s of suggestions) {
          await api.upsertBudget({ categoryId: s.categoryId, period: "monthly", limitCents: s.suggestedLimitCents });
        }
        refresh();
        const total = suggestions.reduce((a, s) => a + s.suggestedLimitCents, 0);
        return {
          created: suggestions.length,
          totalLimitCents: total,
          message:
            suggestions.length === 0
              ? "Not enough history yet to build a budget."
              : `Set ${suggestions.length} monthly budgets from your spending history, ${formatCurrency(total)} total.`,
        };
      },
    });
  }, [api, orchestrator, refresh, announceRun]);

  const value: FinanceContextValue = {
    api,
    orchestrator,
    categories,
    accounts,
    manualAssets,
    revision,
    refresh,
    loadingMeta,
    error,
    runAnnouncement,
    announceRun,
    dismissRun,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFinance must be used within FinanceProvider");
  return ctx;
}

export function useCategoryMap(): Map<string, Category> {
  const { categories } = useFinance();
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
}
