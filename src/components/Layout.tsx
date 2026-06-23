import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useFinance } from "../store/FinanceContext";
import { UserBadge } from "./UserBadge";
import { RunToast } from "./RunToast";

const NAV = [
  { to: "/", label: "Dashboard", icon: "📊", end: true },
  { to: "/transactions", label: "Transactions", icon: "🧾", end: false },
  { to: "/review", label: "Review", icon: "🔔", end: false, badge: true },
  { to: "/budgets", label: "Budgets", icon: "🎯", end: false },
  { to: "/categories", label: "Categories", icon: "🏷️", end: false },
  { to: "/settings", label: "Settings", icon: "⚙️", end: false },
];

export function Layout() {
  const { api, revision, runAnnouncement } = useFinance();
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .listReviewQueue()
      .then((q) => !cancelled && setReviewCount(q.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, revision]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          Conjure Finance
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <span>{item.icon}</span>
            {item.label}
            {item.badge && reviewCount > 0 && <span className="nav-badge">{reviewCount}</span>}
          </NavLink>
        ))}
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
