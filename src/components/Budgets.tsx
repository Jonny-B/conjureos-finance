import { useEffect, useState } from "react";
import { useFinance, useCategoryMap } from "../store/FinanceContext";
import type { Budget, BudgetProgress } from "../api/types";
import { suggestBudgets, type BudgetSuggestion } from "../analytics/budgetSuggest";
import { formatCurrency, monthsAgoISO, todayISO } from "../lib/format";
import { Spinner } from "./common";

export function Budgets() {
  const { api, categories, refresh, revision } = useFinance();
  const catMap = useCategoryMap();
  const [rows, setRows] = useState<BudgetProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[] | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Current-month spend per category drives budget progress.
      const range = { from: todayISO().slice(0, 8) + "01", to: todayISO() };
      const [budgets, dash] = await Promise.all([api.listBudgets(), api.getDashboard(range)]);
      void monthsAgoISO; // (kept for future multi-period support)
      const spendByCat = new Map(dash.byCategory.map((c) => [c.categoryId, c.spentCents]));
      const progress: BudgetProgress[] = budgets.map((b) => {
        const cat = catMap.get(b.categoryId);
        const spent = spendByCat.get(b.categoryId) ?? 0;
        return {
          budget: b,
          categoryName: cat?.name ?? "Unknown",
          color: cat?.color ?? "#475569",
          spentCents: spent,
          limitCents: b.limitCents,
          ratio: b.limitCents > 0 ? spent / b.limitCents : 0,
        };
      });
      if (!cancelled) {
        setRows(progress.sort((a, b) => b.ratio - a.ratio));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, catMap, revision]);

  async function addBudget() {
    if (!newCat || !newLimit) return;
    const limitCents = Math.round(parseFloat(newLimit) * 100);
    if (!Number.isFinite(limitCents) || limitCents <= 0) return;
    await api.upsertBudget({ categoryId: newCat, period: "monthly", limitCents });
    setAdding(false);
    setNewCat("");
    setNewLimit("");
    refresh();
  }

  async function remove(b: Budget) {
    await api.deleteBudget(b.id);
    refresh();
  }

  async function previewSuggestions() {
    if (suggestions) {
      setSuggestions(null);
      return;
    }
    const all = await api.queryTransactions({ limit: 10_000 });
    setSuggestions(suggestBudgets({ transactions: all.items, categories }));
  }

  async function applySuggestions() {
    if (!suggestions) return;
    setApplying(true);
    try {
      for (const s of suggestions) {
        await api.upsertBudget({ categoryId: s.categoryId, period: "monthly", limitCents: s.suggestedLimitCents });
      }
      setSuggestions(null);
      refresh();
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Budgets</div>
          <div className="page-sub">Monthly spending caps and where you stand this month</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="cui-button cui-button--ghost" onClick={previewSuggestions}>
            {suggestions ? "Hide suggestions" : "✨ Build from history"}
          </button>
          <button className="cui-button cui-button--primary" onClick={() => setAdding((a) => !a)}>
            {adding ? "Cancel" : "+ New budget"}
          </button>
        </div>
      </div>

      {suggestions && (
        <div className="cui-card" style={{ marginBottom: 16 }}>
          <div className="row between wrap" style={{ gap: 12, marginBottom: 10 }}>
            <div>
              <strong>Suggested budgets</strong>
              <div className="faint" style={{ fontSize: 12 }}>
                Averaged from your recent months’ spending, plus 10% headroom.
              </div>
            </div>
            <button className="cui-button cui-button--primary btn-sm" onClick={applySuggestions} disabled={applying || suggestions.length === 0}>
              {applying ? "Applying…" : `Apply all ${suggestions.length}`}
            </button>
          </div>
          {suggestions.length === 0 ? (
            <div className="muted">Not enough history yet to suggest budgets.</div>
          ) : (
            <div className="grid" style={{ gap: 2 }}>
              {suggestions.map((s) => (
                <div key={s.categoryId} className="row between" style={{ fontSize: 13, padding: "4px 0" }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="dot" style={{ background: catMap.get(s.categoryId)?.color ?? "#475569" }} />
                    {s.categoryName}
                  </span>
                  <span className="muted">
                    avg {formatCurrency(s.monthlyAvgCents)} → <strong style={{ color: "var(--text)" }}>{formatCurrency(s.suggestedLimitCents)}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {adding && (
        <div className="cui-card" style={{ marginBottom: 16 }}>
          <div className="row wrap" style={{ gap: 12, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label>Category</label>
              <select className="cui-input" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                <option value="">Select…</option>
                {categories
                  .filter((c) => c.id !== "cat_income")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field" style={{ width: 160 }}>
              <label>Monthly limit ($)</label>
              <input
                className="cui-input"
                type="number"
                min="0"
                step="10"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
              />
            </div>
            <button className="cui-button cui-button--primary" onClick={addBudget}>Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="cui-card empty">No budgets yet. Create one to track a category.</div>
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          {rows.map((r) => {
            const over = r.spentCents > r.limitCents;
            const pct = Math.min(100, Math.round(r.ratio * 100));
            const barColor = over ? "var(--bad)" : r.ratio > 0.8 ? "var(--warn)" : r.color;
            return (
              <div key={r.budget.id} className="cui-card">
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="dot" style={{ background: r.color }} /> <strong>{r.categoryName}</strong>
                  </span>
                  <span className="row" style={{ gap: 12 }}>
                    <span className={over ? "neg" : "muted"}>
                      {formatCurrency(r.spentCents)} of {formatCurrency(r.limitCents)}
                    </span>
                    <button className="cui-button cui-button--ghost btn-sm" onClick={() => remove(r.budget)}>Remove</button>
                  </span>
                </div>
                <div className="bar">
                  <span style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
                  {over
                    ? `Over by ${formatCurrency(r.spentCents - r.limitCents)}`
                    : `${formatCurrency(r.limitCents - r.spentCents)} left · ${pct}% used`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
