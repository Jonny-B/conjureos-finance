import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useFinance } from "../store/FinanceContext";
import { detectRecurring } from "../analytics/recurring";
import { computeAlerts } from "../analytics/alerts";
import { hostNotify } from "../platform/host";
import { UserBadge } from "./UserBadge";
import { RunToast } from "./RunToast";
import {
  Icon,
  type IconDefinition,
  faHouse,
  faArrowsRotate,
  faChartColumn,
  faMagnifyingGlass,
  faEllipsis,
  faGem,
  faTag,
  faBell,
  faTriangleExclamation,
  faGear,
  faMoneyBills,
  faChevronLeft,
  faLock,
} from "../lib/icons";

// Alerts already pushed to ConjureOS notifications this session — so a re-render
// or refresh doesn't re-fire the same nudge.
const notifiedAlertIds = new Set<string>();

type BadgeKey = "review" | "alerts";

interface NavItem {
  to: string;
  label: string;
  icon: IconDefinition;
  sub?: string;
  end?: boolean;
  badge?: BadgeKey;
}

// Primary destinations — mobile bottom tab bar + top of the desktop sidebar.
const PRIMARY: NavItem[] = [
  { to: "/", label: "Dashboard", icon: faHouse, sub: "Your money at a glance", end: true },
  { to: "/recurring", label: "Recurring", icon: faArrowsRotate, sub: "Subscriptions, bills & income" },
  { to: "/spending", label: "Spending", icon: faChartColumn, sub: "Where your money goes" },
  { to: "/transactions", label: "Transactions", icon: faMagnifyingGlass, sub: "Every charge, searchable" },
];

// Secondary destinations — the "Extras" sheet (mobile) + a grouped sidebar
// section (desktop). Goals + Credit Score are intentionally absent.
const MORE: NavItem[] = [
  { to: "/budgets", label: "Budget", icon: faMoneyBills, sub: "Caps & where you stand" },
  { to: "/net-worth", label: "Net worth", icon: faGem, sub: "Assets minus debts" },
  { to: "/categories", label: "Categories", icon: faTag, sub: "Manage your buckets" },
  { to: "/review", label: "Review", icon: faBell, sub: "Confirm uncertain ones", badge: "review" },
  { to: "/alerts", label: "Alerts", icon: faTriangleExclamation, sub: "Things worth a look", badge: "alerts" },
  { to: "/settings", label: "Settings", icon: faGear, sub: "Account & connections" },
];

const HEADER: Record<string, { title: string; sub?: string }> = {
  "/more": { title: "Extras", sub: "Everything else" },
  ...Object.fromEntries([...PRIMARY, ...MORE].map((i) => [i.to, { title: i.label, sub: i.sub }])),
};

// Routes that get the branded gradient header. Everything else (the drill-down
// pages reached from Extras) gets a plain, compact back-header — so Settings &
// friends don't carry a big banner.
const PRIMARY_ROUTES = new Set(["/", "/recurring", "/spending", "/transactions", "/more"]);

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
  const isPrimary = PRIMARY_ROUTES.has(location.pathname);

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
          <div className="nav-group-label">Extras</div>
          {MORE.map((item) => (
            <SidebarLink key={item.to} item={item} counts={counts} />
          ))}
        </nav>
        <div className="nav-spacer" />
        <div className="nav-link faint sidebar-aux" style={{ fontSize: 11, cursor: "default" }}>
          <Icon icon={faLock} /> End-to-end encrypted
        </div>
        <div className="sidebar-aux">
          <UserBadge />
        </div>
      </aside>

      {/* ---- mobile header: gradient on primary tabs, plain back-bar elsewhere ---- */}
      {isPrimary ? (
        <header className="app-header">
          <div style={{ minWidth: 0 }}>
            <div className="ah-title">{head.title}</div>
            {head.sub && <div className="ah-sub">{head.sub}</div>}
          </div>
        </header>
      ) : (
        <header className="app-header plain">
          <button className="ah-back" aria-label="Back" onClick={() => navigate(-1)}>
            <Icon icon={faChevronLeft} />
          </button>
          <div className="ah-title">{head.title}</div>
        </header>
      )}

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
            <span className="tab-ico"><Icon icon={item.icon} /></span>
            {item.label}
          </NavLink>
        ))}
        <NavLink to="/more" data-nav="/more" className={`tab${onMore ? " active" : ""}`}>
          <span className="tab-ico"><Icon icon={faEllipsis} /></span>
          Extras
          {moreBadge > 0 && <span className="tab-badge">{moreBadge}</span>}
        </NavLink>
      </nav>

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
      <span className="nav-ico"><Icon icon={item.icon} /></span>
      {item.label}
      {item.badge && count > 0 && <span className="nav-badge">{count}</span>}
    </NavLink>
  );
}
