import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useFinance } from "../store/FinanceContext";
import { detectRecurring } from "../analytics/recurring";
import { computeAlerts } from "../analytics/alerts";
import { hostNotify } from "../platform/host";
import { UserBadge } from "./UserBadge";
import { RunToast } from "./RunToast";

// Alerts already pushed to ConjureOS notifications this session — so a re-render
// or refresh doesn't re-fire the same nudge. (Background/push delivery when the
// app is closed is a backend seam: Plaid webhook → edge function → notify.)
const notifiedAlertIds = new Set<string>();

type BadgeKey = "review" | "alerts";

interface NavItem {
  to: string;
  label: string;
  /** sidebar / more-grid glyph */
  icon: string;
  /** bottom-tab glyph (mobile) */
  tab?: string;
  sub?: string;
  end?: boolean;
  badge?: BadgeKey;
}

// Primary destinations — the mobile bottom tab bar + the top of the desktop sidebar.
const PRIMARY: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "🏠", tab: "🏠", sub: "Your money at a glance", end: true },
  { to: "/recurring", label: "Recurring", icon: "🔁", tab: "🔁", sub: "Subscriptions, bills & income" },
  { to: "/spending", label: "Spending", icon: "📊", tab: "📊", sub: "Where your money goes" },
  { to: "/transactions", label: "Transactions", icon: "🧾", tab: "🔍", sub: "Every charge, searchable" },
];

// Secondary destinations — the "More" sheet (mobile) + a grouped section in the
// desktop sidebar. Goals + Credit Score are intentionally absent.
const MORE: NavItem[] = [
  { to: "/budgets", label: "Budget", icon: "🧮", sub: "Caps & where you stand" },
  { to: "/net-worth", label: "Net worth", icon: "💎", sub: "Assets minus debts" },
  { to: "/categories", label: "Categories", icon: "🏷️", sub: "Manage your buckets" },
  { to: "/review", label: "Review", icon: "🔔", sub: "Confirm uncertain ones", badge: "review" },
  { to: "/alerts", label: "Alerts", icon: "⚠️", sub: "Things worth a look", badge: "alerts" },
  { to: "/settings", label: "Settings", icon: "⚙️", sub: "Account & connections" },
];

const HEADER: Record<string, { title: string; sub?: string }> = {
  "/more": { title: "More", sub: "Everything else" },
  ...Object.fromEntries([...PRIMARY, ...MORE].map((i) => [i.to, { title: i.label, sub: i.sub }])),
};

export function Layout() {
  const { api, categories, accounts, revision, runAnnouncement } = useFinance();
  const [counts, setCounts] = useState<Record<BadgeKey, number>>({ review: 0, alerts: 0 });
  const location = useLocation();
  const navigate = useNavigate();

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
      if (cancelled) return;
      setCounts({ review: queue.length, alerts: alerts.length });
      // Foreground-deliver the urgent ones to ConjureOS notifications, once each.
      // Guard on categories being loaded so alert copy has real names (not the
      // "Category" fallback) — and so we don't poison the dedup set on the first
      // render when context categories are still empty.
      if (categories.length > 0) {
        for (const a of alerts) {
          if (a.severity !== "danger" || notifiedAlertIds.has(a.id)) continue;
          notifiedAlertIds.add(a.id);
          hostNotify(a.title, a.message);
        }
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, categories, accounts, revision]);

  const moreBadge = counts.review + counts.alerts;
  const onMore = location.pathname === "/more" || MORE.some((m) => m.to === location.pathname);
  const head = HEADER[location.pathname] ?? { title: "Conjure Finance" };

  return (
    <div className="app">
      {/* ---- desktop sidebar ---- */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          Conjure Finance
        </div>
        <nav className="nav-links">
          {PRIMARY.map((item) => (
            <SidebarLink key={item.to} item={item} counts={counts} />
          ))}
          <div className="nav-group-label">More</div>
          {MORE.map((item) => (
            <SidebarLink key={item.to} item={item} counts={counts} />
          ))}
        </nav>
        <div className="nav-spacer" />
        <div className="nav-link faint sidebar-aux" style={{ fontSize: 11, cursor: "default" }}>
          🔒 End-to-end encrypted
        </div>
        <div className="sidebar-aux">
          <UserBadge />
        </div>
      </aside>

      {/* ---- mobile gradient header ---- */}
      <header className="app-header">
        <div style={{ minWidth: 0 }}>
          <div className="ah-title">{head.title}</div>
          {head.sub && <div className="ah-sub">{head.sub}</div>}
        </div>
        <button className="app-header-ico" aria-label="Settings" onClick={() => navigate("/settings")}>
          ⚙️
        </button>
      </header>

      <main className="main">
        <Outlet />
      </main>

      {/* ---- mobile bottom tab bar ---- */}
      <nav className="tabbar">
        {PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-nav={item.to}
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            <span className="tab-ico">{item.tab}</span>
            {item.label}
          </NavLink>
        ))}
        <NavLink to="/more" data-nav="/more" className={`tab${onMore ? " active" : ""}`}>
          <span className="tab-ico">☰</span>
          More
          {moreBadge > 0 && <span className="tab-badge">{moreBadge}</span>}
        </NavLink>
      </nav>

      {/* Key by announcement id so a fresh run remounts the toast and replays
          its entrance animation even if one is already showing. */}
      <RunToast key={runAnnouncement?.id ?? "none"} />
    </div>
  );
}

function SidebarLink({ item, counts }: { item: NavItem; counts: Record<BadgeKey, number> }) {
  const count = item.badge ? counts[item.badge] : 0;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      data-nav={item.to}
      className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
    >
      <span>{item.icon}</span>
      {item.label}
      {item.badge && count > 0 && <span className="nav-badge">{count}</span>}
    </NavLink>
  );
}
