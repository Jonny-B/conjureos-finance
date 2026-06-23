import { useCallback, useEffect, useState } from "react";
import { useFinance, useCategoryMap } from "../store/FinanceContext";
import type { Transaction } from "../api/types";
import { summarizeRun, type CategorizationRunResult } from "../orchestrator";
import { formatCurrency, formatDate } from "../lib/format";
import { CategoryChip, CategorySelect, Spinner } from "./common";

export function ReviewQueue() {
  const { api, orchestrator, refresh, revision } = useFinance();
  const catMap = useCategoryMap();
  const [queue, setQueue] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<CategorizationRunResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});

  const load = useCallback(() => {
    setLoading(true);
    api
      .listReviewQueue()
      .then(setQueue)
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(load, [load, revision]);

  async function runOrchestrator() {
    setRunning(true);
    try {
      const cats = await api.listCategories();
      // Re-run across everything not yet human-confirmed.
      const all = await api.queryTransactions({ limit: 10_000 });
      const result = await orchestrator.run(cats, all.items);
      setLastRun(result);
      refresh();
    } finally {
      setRunning(false);
    }
  }

  async function accept(t: Transaction) {
    const chosen = overrides[t.id] !== undefined ? overrides[t.id] : t.categorization.suggestedCategoryId;
    await api.setTransactionCategory(t.id, chosen);
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Review</div>
          <div className="page-sub">Transactions we weren’t sure how to categorize</div>
        </div>
        <button className="cui-button cui-button--primary" onClick={runOrchestrator} disabled={running}>
          {running ? "Categorizing…" : "Auto-categorize"}
        </button>
      </div>

      <div className="hint">
        💡 Tip: ask ConjureOS to <em>“do February’s budget and categorize everything”</em> to sort a
        whole month at once, without opening this page.
      </div>

      {lastRun && (
        <div className={`banner ${lastRun.needsReview > 0 ? "warn" : "success"}`}>
          <span>{lastRun.needsReview > 0 ? "🤖" : "✅"}</span>
          <div>{summarizeRun(lastRun)}</div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : queue.length === 0 ? (
        <div className="cui-card empty">
          🎉 All clear. Everything we were confident about is categorized.
          <div className="muted" style={{ marginTop: 8 }}>
            Run it again, or ask ConjureOS, once new transactions come in.
          </div>
        </div>
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          {queue.map((t) => {
            const override = overrides[t.id];
            const chosen = override !== undefined ? override : t.categorization.suggestedCategoryId;
            return (
              <div key={t.id} className="cui-card">
                <div className="row between wrap" style={{ gap: 12 }}>
                  <div>
                    <div className="row" style={{ gap: 10 }}>
                      <strong>{t.merchantName}</strong>
                      <span className="faint">{formatDate(t.date)}</span>
                    </div>
                    <div className="faint" style={{ fontSize: 12 }}>{t.rawDescription}</div>
                  </div>
                  <div className={`amount ${t.amountCents >= 0 ? "pos" : ""}`} style={{ fontSize: 16 }}>
                    {formatCurrency(t.amountCents)}
                  </div>
                </div>

                {t.categorization.reasoning && (
                  <div className="muted" style={{ margin: "10px 0", fontSize: 13 }}>
                    🤖 {t.categorization.reasoning}
                  </div>
                )}

                <div className="row between wrap" style={{ gap: 12, marginTop: 6 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="faint">Suggested:</span>
                    <CategoryChip category={catMap.get(t.categorization.suggestedCategoryId ?? "")} />
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <div style={{ minWidth: 200 }}>
                      <CategorySelect
                        value={chosen}
                        onChange={(c) => setOverrides((o) => ({ ...o, [t.id]: c }))}
                      />
                    </div>
                    <button className="cui-button cui-button--primary" onClick={() => accept(t)}>
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
