import { useEffect, useState } from "react";
import { useFinance } from "../store/FinanceContext";
import type { SavingsGoal } from "../api/types";
import { formatCurrency } from "../lib/format";
import { Spinner } from "./common";

export function Goals() {
  const { api, revision, refresh } = useFinance();
  const [goals, setGoals] = useState<SavingsGoal[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.listSavingsGoals().then((g) => !cancelled && setGoals(g));
    return () => {
      cancelled = true;
    };
  }, [api, revision]);

  async function addGoal() {
    const cents = Math.round(parseFloat(target) * 100);
    if (!name.trim() || !Number.isFinite(cents) || cents <= 0) return;
    await api.upsertSavingsGoal({ name: name.trim(), targetCents: cents, savedCents: 0 });
    setName("");
    setTarget("");
    setAdding(false);
    refresh();
  }

  async function contribute(g: SavingsGoal, deltaCents: number) {
    const savedCents = Math.max(0, Math.min(g.targetCents, g.savedCents + deltaCents));
    await api.upsertSavingsGoal({ ...g, savedCents });
    refresh();
  }

  async function remove(g: SavingsGoal) {
    await api.deleteSavingsGoal(g.id);
    refresh();
  }

  if (!goals) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Goals</div>
          <div className="page-sub">Set a target and watch it fill up</div>
        </div>
        <button className="cui-button cui-button--primary" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ New goal"}
        </button>
      </div>

      <div className="hint" style={{ marginBottom: 16 }}>
        💡 Contributions here are <em>simulated</em>. Automatic transfers into an FDIC-insured account
        switch on once a banking partner is connected.
      </div>

      {adding && (
        <div className="cui-card" style={{ marginBottom: 16 }}>
          <div className="row wrap" style={{ gap: 12, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Goal</label>
              <input className="cui-input" value={name} placeholder="e.g. Emergency fund" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field" style={{ width: 160 }}>
              <label>Target ($)</label>
              <input className="cui-input" type="number" min="0" step="100" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <button className="cui-button cui-button--primary" onClick={addGoal}>Create</button>
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="cui-card empty">No goals yet. Create one to start saving toward something.</div>
      ) : (
        <div className="grid grid-2">
          {goals.map((g) => {
            const pct = g.targetCents > 0 ? Math.min(100, Math.round((g.savedCents / g.targetCents) * 100)) : 0;
            const done = g.savedCents >= g.targetCents;
            return (
              <div key={g.id} className="cui-card">
                <div className="row between" style={{ marginBottom: 8 }}>
                  <strong>{g.name}</strong>
                  <button className="cui-button cui-button--ghost btn-sm" onClick={() => remove(g)}>Remove</button>
                </div>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span className="amount">{formatCurrency(g.savedCents)}</span>
                  <span className="faint">of {formatCurrency(g.targetCents)}</span>
                </div>
                <div className="bar">
                  <span style={{ width: `${pct}%`, background: done ? "var(--good)" : "var(--accent)" }} />
                </div>
                <div className="row between" style={{ marginTop: 10 }}>
                  <span className="faint" style={{ fontSize: 12 }}>{done ? "🎉 Goal reached" : `${pct}% there`}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="cui-button cui-button--ghost btn-sm" onClick={() => contribute(g, 5_000)} disabled={done}>+$50</button>
                    <button className="cui-button cui-button--ghost btn-sm" onClick={() => contribute(g, 20_000)} disabled={done}>+$200</button>
                    <button className="cui-button cui-button--ghost btn-sm" onClick={() => contribute(g, -5_000)} disabled={g.savedCents === 0}>−$50</button>
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
