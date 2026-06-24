import { useEffect, useState } from "react";
import { useFinance } from "../store/FinanceContext";
import { detectRecurring } from "../analytics/recurring";
import { computeAlerts, type FinanceAlert } from "../analytics/alerts";
import { Spinner } from "./common";

const ICON: Record<FinanceAlert["kind"], string> = {
  low_balance: "📉",
  near_budget: "🟡",
  over_budget: "🔴",
  upcoming_bill: "📅",
  price_increase: "↑",
};

export function Alerts() {
  const { api, categories, accounts, revision } = useFinance();
  const [alerts, setAlerts] = useState<FinanceAlert[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [txnPage, budgets] = await Promise.all([
        api.queryTransactions({ limit: 10_000 }),
        api.listBudgets(),
      ]);
      const streams = detectRecurring(txnPage.items);
      const result = computeAlerts({
        accounts,
        budgets,
        categories,
        transactions: txnPage.items,
        streams,
      });
      if (!cancelled) setAlerts(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, categories, accounts, revision]);

  if (!alerts) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Alerts</div>
          <div className="page-sub">Things worth a look — balances, budgets and upcoming bills</div>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="cui-card empty">
          🎉 All clear. No alerts right now.
          <div className="muted" style={{ marginTop: 8 }}>
            We’ll flag low balances, over-budget categories, upcoming bills and price hikes here.
          </div>
        </div>
      ) : (
        <div className="grid" style={{ gap: 10 }}>
          {alerts.map((a) => (
            <div key={a.id} className={`banner ${a.severity === "danger" ? "danger" : a.severity === "warn" ? "warn" : "info"}`}>
              <span style={{ fontSize: 18 }}>{ICON[a.kind]}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{a.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>{a.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
