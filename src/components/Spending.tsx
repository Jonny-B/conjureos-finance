import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { useFinance } from "../store/FinanceContext";
import type { DashboardSummary, Transaction } from "../api/types";
import { addDays, daysBetween, monthKey } from "../analytics/dates";
import { formatCurrency, monthLabel, todayISO } from "../lib/format";
import { Icon, faSackDollar, faMoneyBillTransfer } from "../lib/icons";
import { Spinner } from "./common";

type Period = "week" | "month" | "quarter" | "year";
type Gran = "day" | "week" | "month";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MON[m - 1]} ${d}`;
}

function rangeFor(period: Period): { from: string; to: string; gran: Gran } {
  const to = todayISO();
  if (period === "week") return { from: addDays(to, -6), to, gran: "day" };
  if (period === "month") return { from: to.slice(0, 8) + "01", to, gran: "week" };
  if (period === "quarter") return { from: addDays(to, -89), to, gran: "month" };
  return { from: addDays(to, -364), to, gran: "month" };
}

interface Bucket {
  key: string;
  label: string;
  income: number;
  spend: number;
}

function buildSeries(txns: Transaction[], from: string, to: string, gran: Gran): Bucket[] {
  const buckets: Bucket[] = [];
  const index = new Map<string, number>();
  if (gran === "month") {
    let [y, m] = from.slice(0, 7).split("-").map(Number);
    const end = to.slice(0, 7);
    for (let guard = 0; guard < 24; guard++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      index.set(key, buckets.length);
      buckets.push({ key, label: monthLabel(key), income: 0, spend: 0 });
      if (key === end) break;
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  } else {
    const step = gran === "week" ? 7 : 1;
    for (let d = from, guard = 0; d <= to && guard < 60; d = addDays(d, step), guard++) {
      buckets.push({ key: d, label: shortDate(d), income: 0, spend: 0 });
    }
  }
  for (const t of txns) {
    if (t.date < from || t.date > to) continue;
    let i: number;
    if (gran === "month") i = index.get(monthKey(t.date)) ?? -1;
    else i = Math.floor(daysBetween(from, t.date) / (gran === "week" ? 7 : 1));
    const b = buckets[i];
    if (!b) continue;
    if (t.amountCents >= 0) b.income += t.amountCents;
    else b.spend += -t.amountCents;
  }
  return buckets;
}

export function Spending() {
  const { api, revision } = useFinance();
  const [period, setPeriod] = useState<Period>("month");
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeFor(period), [period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.queryTransactions({ limit: 10_000 }), api.getDashboard(range)])
      .then(([p, d]) => {
        if (cancelled) return;
        setTxns(p.items);
        setDash(d);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, range, revision]);

  const series = useMemo(
    () => (txns ? buildSeries(txns, range.from, range.to, range.gran) : []),
    [txns, range],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Spending</div>
          <div className="page-sub">Where your money goes</div>
        </div>
      </div>

      <div className="segmented" style={{ marginBottom: 16 }}>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={p.key === period ? "active" : ""}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading || !dash ? (
        <Spinner />
      ) : (
        <div className="grid" style={{ gap: 16 }}>
          <div className="cui-card">
            <div className="card-title">Income vs spend</div>
            <IncomeSpendChart series={series} />
            <div className="row" style={{ gap: 18, marginTop: 6, fontSize: 12 }}>
              <span className="row" style={{ gap: 6 }}>
                <span className="dot" style={{ background: "#22c55e" }} /> Income
              </span>
              <span className="row" style={{ gap: 6 }}>
                <span className="dot" style={{ background: "var(--accent)" }} /> Total spend
              </span>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="cui-card row between" style={{ alignItems: "center" }}>
              <div>
                <div className="stat-label">Income</div>
                <div className="stat pos" style={{ fontSize: 22 }}>
                  {formatCurrency(dash.totalIncomeCents)}
                </div>
              </div>
              <span style={{ fontSize: 20, color: "var(--good)" }}><Icon icon={faSackDollar} /></span>
            </div>
            <div className="cui-card row between" style={{ alignItems: "center" }}>
              <div>
                <div className="stat-label">Total spend</div>
                <div className="stat" style={{ fontSize: 22 }}>
                  {formatCurrency(dash.totalSpentCents)}
                </div>
              </div>
              <span style={{ fontSize: 20, color: "var(--accent)" }}><Icon icon={faMoneyBillTransfer} /></span>
            </div>
          </div>

          <div className="cui-card">
            <div className="card-title">Breakdown by category</div>
            <Breakdown data={dash} />
          </div>
        </div>
      )}
    </>
  );
}

function IncomeSpendChart({ series }: { series: Bucket[] }) {
  const rows = series.map((b) => ({
    label: b.label,
    Income: b.income / 100,
    Spend: b.spend / 100,
  }));
  if (rows.length === 0) return <div className="empty">No activity in this range.</div>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
        <XAxis dataKey="label" stroke="#66718a" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(140,140,160,0.12)" }} />
        <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Spend" fill="var(--accent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Breakdown({ data }: { data: DashboardSummary }) {
  const top = data.byCategory.slice(0, 8);
  if (top.length === 0) return <div className="empty">No spending in this range.</div>;
  const max = Math.max(1, ...top.map((c) => c.spentCents));
  return (
    <div className="grid grid-2" style={{ alignItems: "center", gap: 20 }}>
      <div className="donut-wrap" style={{ minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie
              data={top}
              dataKey="spentCents"
              nameKey="categoryName"
              innerRadius={70}
              outerRadius={104}
              paddingAngle={2}
              stroke="none"
            >
              {top.map((c) => (
                <Cell key={c.categoryId} fill={c.color} />
              ))}
            </Pie>
            <Tooltip content={<PieTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span className="dc-label">Spent</span>
          <span className="dc-value">{formatCurrency(data.totalSpentCents)}</span>
        </div>
      </div>
      <div className="grid" style={{ gap: 10, minWidth: 0 }}>
        {top.map((c) => (
          <div key={c.categoryId}>
            <div className="row between" style={{ marginBottom: 4 }}>
              <span className="row" style={{ gap: 7, minWidth: 0 }}>
                <span className="dot" style={{ background: c.color }} /> {c.categoryName}
              </span>
              <span className="amount">{formatCurrency(c.spentCents)}</span>
            </div>
            <div className="bar">
              <span style={{ width: `${(c.spentCents / max) * 100}%`, background: c.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip-box">
      <strong>{label}</strong>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {formatCurrency(p.value * 100)}
        </div>
      ))}
    </div>
  );
}

function PieTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tooltip-box">
      <strong>{p.categoryName}</strong>
      <div>
        {formatCurrency(p.spentCents)} · {p.txnCount} txns
      </div>
    </div>
  );
}
