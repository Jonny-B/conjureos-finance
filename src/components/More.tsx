import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useFinance } from "../store/FinanceContext";
import { detectRecurring } from "../analytics/recurring";
import { computeAlerts } from "../analytics/alerts";
import {
  Icon,
  type IconDefinition,
  faMoneyBills,
  faGem,
  faTag,
  faBell,
  faTriangleExclamation,
  faGear,
  faLock,
} from "../lib/icons";

interface Tile {
  to: string;
  label: string;
  icon: IconDefinition;
  sub: string;
  badge?: "review" | "alerts";
}

// Secondary destinations. Goals + Credit Score are intentionally omitted.
const TILES: Tile[] = [
  { to: "/budgets", label: "Budget", icon: faMoneyBills, sub: "Caps & where you stand" },
  { to: "/net-worth", label: "Net worth", icon: faGem, sub: "Assets minus debts" },
  { to: "/categories", label: "Categories", icon: faTag, sub: "Manage your buckets" },
  { to: "/review", label: "Review", icon: faBell, sub: "Confirm uncertain ones", badge: "review" },
  { to: "/alerts", label: "Alerts", icon: faTriangleExclamation, sub: "Things worth a look", badge: "alerts" },
  { to: "/settings", label: "Settings", icon: faGear, sub: "Account & connections" },
];

export function More() {
  const { api, categories, accounts, revision } = useFinance();
  const [counts, setCounts] = useState<{ review: number; alerts: number }>({ review: 0, alerts: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [queue, txnPage, budgets] = await Promise.all([
        api.listReviewQueue(),
        api.queryTransactions({ limit: 10_000 }),
        api.listBudgets(),
      ]);
      const streams = detectRecurring(txnPage.items);
      const alerts = computeAlerts({ accounts, budgets, categories, transactions: txnPage.items, streams });
      if (!cancelled) setCounts({ review: queue.length, alerts: alerts.length });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, categories, accounts, revision]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Extras</div>
          <div className="page-sub">Everything else</div>
        </div>
      </div>

      <div className="more-grid">
        {TILES.map((t) => {
          const count = t.badge ? counts[t.badge] : 0;
          return (
            <Link key={t.to} to={t.to} data-nav={t.to} className="cui-card more-tile">
              <span className="mt-ico"><Icon icon={t.icon} /></span>
              <div>
                <div className="mt-label">{t.label}</div>
                <div className="mt-sub">{t.sub}</div>
              </div>
              {t.badge && count > 0 && <span className="nav-badge">{count}</span>}
            </Link>
          );
        })}
      </div>

      <div className="hint" style={{ marginTop: 16 }}>
        <Icon icon={faLock} />
        <span>Your data is end-to-end encrypted. Ask ConjureOS to <em>"categorize this month"</em> any time.</span>
      </div>
    </>
  );
}
