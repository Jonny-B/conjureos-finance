import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFinance } from "../store/FinanceContext";
import type { Account, DashboardSummary, Transaction } from "../api/types";
import { computeNetWorth } from "../analytics/networth";
import { detectRecurring } from "../analytics/recurring";
import { computeAlerts, type FinanceAlert } from "../analytics/alerts";
import { daysBetween } from "../analytics/dates";
import { formatCurrency, todayISO } from "../lib/format";
import { Spinner } from "./common";

const ACCT_ICON: Record<Account["type"], string> = {
  checking: "🏦",
  savings: "🐷",
  credit: "💳",
  investment: "📈",
  loan: "🏠",
  cash: "💵",
};

function prevMonthStart(): string {
  const today = todayISO();
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function Dashboard() {
  const { api, revision, accounts, manualAssets, categories } = useFinance();
  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [alerts, setAlerts] = useState<FinanceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [d, page, budgets] = await Promise.all([
        api.getDashboard({ from: prevMonthStart(), to: todayISO() }),
        api.queryTransactions({ limit: 10_000 }),
        api.listBudgets(),
      ]);
      if (cancelled) return;
      setDash(d);
      setTxns(page.items);
      const streams = detectRecurring(page.items);
      setAlerts(computeAlerts({ accounts, budgets, categories, transactions: page.items, streams }));
    })()
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, revision, accounts, categories]);

  const nw = useMemo(() => computeNetWorth(accounts, manualAssets), [accounts, manualAssets]);

  const { thisSpend, delta } = useMemo(() => {
    if (!dash) return { thisSpend: 0, delta: 0 };
    const curKey = todayISO().slice(0, 7);
    const cur = dash.monthly.find((m) => m.month === curKey)?.spentCents ?? 0;
    const prev = dash.monthly.find((m) => m.month !== curKey)?.spentCents ?? 0;
    return { thisSpend: cur, delta: prev - cur };
  }, [dash]);

  const payday = useMemo(() => {
    if (!txns) return null;
    const today = todayISO();
    const inflow = detectRecurring(txns)
      .filter((s) => s.direction === "inflow" && s.status === "active" && s.nextDate >= today)
      .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))[0];
    if (!inflow) return null;
    return { days: daysBetween(today, inflow.nextDate), amount: inflow.avgAmountCents };
  }, [txns]);

  // Net cash = liquid balances; credit/loan balances are stored negative so they net out.
  const netCash = accounts
    .filter((a) => a.type !== "investment")
    .reduce((sum, a) => sum + a.balanceCents, 0);

  const banner = alerts.find((a) => a.severity === "danger") ?? alerts.find((a) => a.severity === "warn");

  if (loading || !dash) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Your money at a glance</div>
        </div>
      </div>

      {banner && (
        <Link to="/alerts" className={`banner ${banner.severity === "danger" ? "danger" : "warn"}`} style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 18 }}>{banner.severity === "danger" ? "⚠️" : "🔔"}</span>
          <div style={{ minWidth: 0 }}>
            <strong>{banner.title}</strong>
            <div className="faint" style={{ fontSize: 12 }}>{banner.message}</div>
          </div>
          <span className="faint" style={{ marginLeft: "auto" }}>›</span>
        </Link>
      )}

      <HeroCarousel
        thisSpend={thisSpend}
        delta={delta}
        payday={payday}
        nw={nw}
      />

      <div className="cui-card" style={{ marginTop: 16 }}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ margin: 0 }}>Accounts</div>
          <span className="row" style={{ gap: 6, fontSize: 12 }}>
            <span className="faint">Net cash</span>
            <strong className={netCash >= 0 ? "pos" : "neg"}>{formatCurrency(netCash)}</strong>
          </span>
        </div>
        {accounts.length === 0 ? (
          <div className="empty">No accounts linked yet.</div>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="acct-row">
              <span className="cat-ico" style={{ background: "var(--bg-elev-2)" }}>{ACCT_ICON[a.type]}</span>
              <div style={{ minWidth: 0 }}>
                <div className="acct-name">{a.name}</div>
                <div className="acct-sub">{a.institution} ··{a.mask}</div>
              </div>
              <span className={`acct-bal ${a.balanceCents < 0 ? "neg" : ""}`}>{formatCurrency(a.balanceCents)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function HeroCarousel({
  thisSpend,
  delta,
  payday,
  nw,
}: {
  thisSpend: number;
  delta: number;
  payday: { days: number; amount: number } | null;
  nw: ReturnType<typeof computeNetWorth>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setActive(i);
  }

  return (
    <>
      <div className="hero" ref={ref} onScroll={onScroll}>
        {/* Spend this month */}
        <div className="cui-card hero-card">
          <div className="stat-label">Spent this month</div>
          <div className="hero-stat">{formatCurrency(thisSpend)}</div>
          <div style={{ marginTop: 4, fontSize: 13 }} className={delta >= 0 ? "pos" : "neg"}>
            {delta >= 0
              ? `✓ ${formatCurrency(Math.abs(delta))} below last month`
              : `↑ ${formatCurrency(Math.abs(delta))} above last month`}
          </div>
          <div className="hero-foot">
            <span style={{ fontSize: 16 }}>{payday ? "📅" : "💸"}</span>
            {payday ? (
              <span>
                Payday {payday.days === 0 ? "today" : `in ${payday.days} day${payday.days === 1 ? "" : "s"}`}
                {" · "}
                <span className="pos">{formatCurrency(Math.abs(payday.amount))}</span>
              </span>
            ) : (
              <Link to="/spending" className="muted">See spending breakdown ›</Link>
            )}
          </div>
        </div>

        {/* Net worth */}
        <Link to="/net-worth" className="cui-card hero-card net-worth-card" style={{ textDecoration: "none" }}>
          <div className="stat-label">Net worth</div>
          <div className={`hero-stat ${nw.netCents >= 0 ? "pos" : "neg"}`}>{formatCurrency(nw.netCents)}</div>
          <div style={{ marginTop: 4, fontSize: 13 }} className="faint">
            {formatCurrency(nw.assetsCents)} assets · {formatCurrency(nw.liabilitiesCents)} debt
          </div>
          <div className="hero-foot">
            <span style={{ fontSize: 16 }}>💎</span>
            <span className="muted">View breakdown ›</span>
          </div>
        </Link>
      </div>

      <div className="hero-dots">
        {[0, 1].map((i) => (
          <span key={i} className={`hero-dot${i === active ? " on" : ""}`} />
        ))}
      </div>
    </>
  );
}
