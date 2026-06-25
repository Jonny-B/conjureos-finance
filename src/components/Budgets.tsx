import { useEffect, useState } from "react";
import { useFinance, useCategoryMap } from "../store/FinanceContext";
import type { Budget, BudgetProgress } from "../api/types";
import { suggestBudgets, type BudgetSuggestion } from "../analytics/budgetSuggest";
import { formatCurrency, todayISO } from "../lib/format";
import { Icon, categoryIcon, faWandMagicSparkles, faXmark } from "../lib/icons";
import { Spinner } from "./common";

function daysLeftInMonth(): number {
  const today = todayISO();
  const [y, m, d] = today.split("-").map(Number);
  const total = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  return Math.max(1, total - d + 1);
}

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
      const range = { from: todayISO().slice(0, 8) + "01", to: todayISO() };
      const [budgets, dash] = await Promise.all([api.listBudgets(), api.getDashboard(range)]);
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

  const totalBudget = rows.reduce((s, r) => s + r.limitCents, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spentCents, 0);
  const leftToSpend = totalBudget - totalSpent;
  const pct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;
  const perDay = Math.max(0, Math.round(leftToSpend / daysLeftInMonth()));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Budget</div>
          <div className="page-sub">Caps and where you stand this month</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="cui-button cui-button--ghost btn-sm" onClick={previewSuggestions}>
            {suggestions ? "Hide suggestions" : <><Icon icon={faWandMagicSparkles} /> Build from history</>}
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid" style={{ gap: 16 }}>
          {/* Summary card — total spend vs budget, left-to-spend + daily pace. */}
          {totalBudget > 0 && (
            <div className="cui-card">
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div className="stat-label">Spending</div>
                <span className="budget-pill" style={leftToSpend < 0 ? { background: "color-mix(in srgb, var(--bad) 16%, transparent)", color: "var(--bad)" } : undefined}>
                  {leftToSpend >= 0 ? `${formatCurrency(perDay)}/day for ${daysLeftInMonth()}d` : "over budget"}
                </span>
              </div>
              <div className="hero-stat" style={{ marginTop: 4 }}>
                {leftToSpend >= 0 ? formatCurrency(leftToSpend) : formatCurrency(-leftToSpend)}
              </div>
              <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>
                {leftToSpend >= 0 ? "left to spend" : "over budget"}
              </div>
              <div className="bar">
                <span style={{ width: `${pct}%`, background: leftToSpend < 0 ? "var(--bad)" : pct > 80 ? "var(--warn)" : "var(--accent)" }} />
              </div>
              <div className="row between" style={{ marginTop: 6, fontSize: 12 }}>
                <span className="faint">{formatCurrency(totalSpent)} spent</span>
                <span className="faint">{formatCurrency(totalBudget)} budgeted</span>
              </div>
            </div>
          )}

          {suggestions && (
            <div className="cui-card">
              <div className="row between wrap" style={{ gap: 12, marginBottom: 10 }}>
                <div>
                  <strong>Suggested budgets</strong>
                  <div className="faint" style={{ fontSize: 12 }}>
                    Averaged from recent months, plus 10% headroom.
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

          {/* Category budgets list */}
          <div className="cui-card">
            <div className="row between" style={{ marginBottom: 4 }}>
              <div className="card-title" style={{ margin: 0 }}>Category budgets</div>
              <button className="cui-button cui-button--ghost btn-sm" onClick={() => setAdding((a) => !a)}>
                {adding ? "Cancel" : "+ Add budget"}
              </button>
            </div>

            {adding && (
              <div className="row wrap" style={{ gap: 12, alignItems: "flex-end", padding: "10px 0 14px" }}>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>Category</label>
                  <select className="cui-input" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                    <option value="">Select…</option>
                    {categories
                      .filter((c) => c.id !== "cat_income")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field" style={{ width: 140 }}>
                  <label>Monthly limit ($)</label>
                  <input className="cui-input" type="number" min="0" step="10" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} />
                </div>
                <button className="cui-button cui-button--primary" onClick={addBudget}>Save</button>
              </div>
            )}

            {rows.length === 0 ? (
              <div className="empty">No budgets yet. Add one to track a category.</div>
            ) : (
              rows.map((r) => {
                const over = r.spentCents > r.limitCents;
                const p = Math.min(100, Math.round(r.ratio * 100));
                const barColor = over ? "var(--bad)" : r.ratio > 0.8 ? "var(--warn)" : r.color;
                return (
                  <div key={r.budget.id} className="cat-budget-row">
                    <span className="cat-ico" style={{ background: `color-mix(in srgb, ${r.color} 22%, transparent)`, color: r.color }}>
                      <Icon icon={categoryIcon(r.budget.categoryId)} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row between" style={{ marginBottom: 5 }}>
                        <strong>{r.categoryName}</strong>
                        <span className={over ? "neg" : "muted"} style={{ fontSize: 13 }}>
                          {over ? `${formatCurrency(r.spentCents - r.limitCents)} over` : `${formatCurrency(r.limitCents - r.spentCents)} left`}
                        </span>
                      </div>
                      <div className="bar">
                        <span style={{ width: `${p}%`, background: barColor }} />
                      </div>
                      <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
                        {formatCurrency(r.spentCents)} of {formatCurrency(r.limitCents)}
                      </div>
                    </div>
                    <button className="cui-button cui-button--ghost btn-sm" onClick={() => remove(r.budget)} aria-label="Remove budget"><Icon icon={faXmark} /></button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
