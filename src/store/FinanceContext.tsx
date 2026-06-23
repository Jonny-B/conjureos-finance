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
import type { Account, Category } from "../api/types";
import {
  buildOrchestrator,
  summarizeRun,
  type CategorizationOrchestrator,
  type CategorizationRunResult,
} from "../orchestrator";
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
        const [cats, accs] = await Promise.all([api.listCategories(), api.listAccounts()]);
        if (cancelled) return;
        setCategories(cats);
        setAccounts(accs);
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
    });
  }, [api, orchestrator, refresh, announceRun]);

  const value: FinanceContextValue = {
    api,
    orchestrator,
    categories,
    accounts,
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
