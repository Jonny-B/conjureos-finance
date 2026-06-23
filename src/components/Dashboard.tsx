import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { useFinance } from "../store/FinanceContext";
import type { Account, DashboardSummary, ManualAsset } from "../api/types";
import { computeNetWorth } from "../analytics/networth";
import { formatCompact, formatCurrency, monthLabel, monthsAgoISO, todayISO } from "../lib/format";
import { Spinner } from "./common";

const RANGES = [
  { label: "1M", months: 0 },
  { label: "3M", months: 2 },
  { label: "6M", months: 5 },
];

export function Dashboard() {
  const { api, revision, accounts, manualAssets } = useFinance();
  const [rangeIdx, setRangeIdx] = useState(1);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const months = RANGES[rangeIdx].months;
    return { from: monthsAgoISO(months), to: todayISO() };
  }, [rangeIdx]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getDashboard(range)
      .then((d) => !cancelled && setData(d))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, range, revision]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Your spending at a glance</div>
        </div>
        <div className="row">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              className={`cui-button btn-sm${i === rangeIdx ? " cui-button--primary" : ""}`}
              onClick={() => setRangeIdx(i)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <Spinner />
      ) : (
        <div className="grid" style={{ gap: 16 }}>
          <NetWorthCard accounts={accounts} manualAssets={manualAssets} />

          <div className="grid grid-4">
            <Stat label="Spent" value={formatCurrency(data.totalSpentCents)} cls="neg" />
            <Stat label="Income" value={formatCurrency(data.totalIncomeCents)} cls="pos" />
            <Stat
              label="Net"
              value={formatCurrency(data.netCents)}
              cls={data.netCents >= 0 ? "pos" : "neg"}
            />
            <Stat label="Categories used" value={String(data.byCategory.length)} />
          </div>

          <div className="grid grid-2">
            <div className="cui-card">
              <div className="card-title">Spending by category</div>
              <CategoryPie data={data} />
            </div>
            <div className="cui-card">
              <div className="card-title">Monthly spend vs income</div>
              <MonthlyChart data={data} />
            </div>
          </div>

          <div className="grid grid-2">
            <div className="cui-card">
              <div className="card-title">Category breakdown</div>
              <CategoryBars data={data} />
            </div>
            <div className="cui-card">
              <div className="card-title">Top merchants</div>
              <table className="table">
                <tbody>
                  {data.topMerchants.map((m) => (
                    <tr key={m.merchantName}>
                      <td>{m.merchantName}</td>
                      <td className="faint">{m.txnCount} txns</td>
                      <td className="amount">{formatCurrency(m.spentCents)}</td>
                    </tr>
                  ))}
                  {data.topMerchants.length === 0 && (
                    <tr>
                      <td className="muted">No spending in range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NetWorthCard({ accounts, manualAssets }: { accounts: Account[]; manualAssets: ManualAsset[] }) {
  const nw = computeNetWorth(accounts, manualAssets);
  if (accounts.length === 0 && manualAssets.length === 0) return null;
  return (
    <Link to="/net-worth" className="cui-card net-worth-card">
      <div className="row between wrap" style={{ gap: 16, alignItems: "center" }}>
        <div>
          <div className="stat-label">Net worth</div>
          <div className={`stat ${nw.netCents >= 0 ? "pos" : "neg"}`} style={{ fontSize: 30 }}>
            {formatCurrency(nw.netCents)}
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
            {formatCurrency(nw.assetsCents)} assets · {formatCurrency(nw.liabilitiesCents)} debt
          </div>
        </div>
        <span className="cui-pill pill-neutral">View breakdown →</span>
      </div>
    </Link>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="cui-card">
      <div className="stat-label">{label}</div>
      <div className={`stat ${cls ?? ""}`}>{value}</div>
    </div>
  );
}

function CategoryPie({ data }: { data: DashboardSummary }) {
  const top = data.byCategory.slice(0, 8);
  if (top.length === 0) return <div className="empty">No spending in range.</div>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={top}
          dataKey="spentCents"
          nameKey="categoryName"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
        >
          {top.map((c) => (
            <Cell key={c.categoryId} fill={c.color} stroke="#0b0f17" />
          ))}
        </Pie>
        <Tooltip content={<PieTip />} />
        <Legend formatter={(v) => <span style={{ color: "#9aa6b8", fontSize: 12 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function MonthlyChart({ data }: { data: DashboardSummary }) {
  const rows = data.monthly.map((m) => ({
    month: monthLabel(m.month),
    Spent: m.spentCents / 100,
    Income: m.incomeCents / 100,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" stroke="#66718a" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#66718a"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCompact(v * 100)}
        />
        <Tooltip content={<BarTip />} cursor={{ fill: "#1a2233" }} />
        <Legend formatter={(v) => <span style={{ color: "#9aa6b8", fontSize: 12 }}>{v}</span>} />
        <Bar dataKey="Spent" fill="#ef4444" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoryBars({ data }: { data: DashboardSummary }) {
  const max = Math.max(1, ...data.byCategory.map((c) => c.spentCents));
  return (
    <div className="grid" style={{ gap: 10 }}>
      {data.byCategory.slice(0, 10).map((c) => (
        <div key={c.categoryId}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <span className="row" style={{ gap: 7 }}>
              <span className="dot" style={{ background: c.color }} /> {c.categoryName}
            </span>
            <span className="amount">{formatCurrency(c.spentCents)}</span>
          </div>
          <div className="bar">
            <span style={{ width: `${(c.spentCents / max) * 100}%`, background: c.color }} />
          </div>
        </div>
      ))}
      {data.byCategory.length === 0 && <div className="empty">No spending in range.</div>}
    </div>
  );
}

function PieTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tooltip-box">
      <strong>{p.categoryName}</strong>
      <div>{formatCurrency(p.spentCents)} · {p.txnCount} txns</div>
    </div>
  );
}

function BarTip({ active, payload, label }: any) {
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
