import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useFinance } from "../store/FinanceContext";
import { detectRecurring } from "../analytics/recurring";
import { computeAlerts } from "../analytics/alerts";
import { UserBadge } from "./UserBadge";
import { RunToast } from "./RunToast";

type BadgeKey = "review" | "alerts";

const NAV: { to: string; label: string; icon: string; end: boolean; badge?: BadgeKey }[] = [
  { to: "/", label: "Dashboard", icon: "📊", end: true },
  { to: "/transactions", label: "Transactions", icon: "🧾", end: false },
  { to: "/recurring", label: "Recurring", icon: "🔁", end: false },
  { to: "/budgets", label: "Budgets", icon: "🎯", end: false },
  { to: "/review", label: "Review", icon: "🔔", end: false, badge: "review" },
  { to: "/alerts", label: "Alerts", icon: "⚠️", end: false, badge: "alerts" },
  { to: "/categories", label: "Categories", icon: "🏷️", end: false },
  { to: "/settings", label: "Settings", icon: "⚙️", end: false },
];

export function Layout() {
  const { api, categories, accounts, revision, runAnnouncement } = useFinance();
  const [counts, setCounts] = useState<Record<BadgeKey, number>>({ review: 0, alerts: 0 });

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
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          Conjure Finance
        </div>
        {NAV.map((item) => {
          const count = item.badge ? counts[item.badge] : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.badge && count > 0 && <span className="nav-badge">{count}</span>}
            </NavLink>
          );
        })}
        <div className="nav-spacer" />
        <div className="nav-link faint" style={{ fontSize: 11, cursor: "default" }}>
          🔒 End-to-end encrypted
        </div>
        <UserBadge />
      </aside>
      <main className="main">
        <Outlet />
      </main>
      {/* Key by announcement id so a fresh run remounts the toast and replays
          its entrance animation even if one is already showing. */}
      <RunToast key={runAnnouncement?.id ?? "none"} />
    </div>
  );
}
