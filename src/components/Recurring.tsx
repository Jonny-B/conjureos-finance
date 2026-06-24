import { useEffect, useMemo, useState } from "react";
import { useFinance, useCategoryMap } from "../store/FinanceContext";
import type { Transaction } from "../api/types";
import {
  detectRecurring,
  isSubscription,
  monthlyAmountCents,
  cadenceLabel,
  type RecurringStream,
} from "../analytics/recurring";
import { addDays, daysBetween } from "../analytics/dates";
import { formatCurrency, formatDate, todayISO } from "../lib/format";
import { CategoryChip, MerchantLogo, Spinner } from "./common";

export function Recurring() {
  const { api, revision } = useFinance();
  const catMap = useCategoryMap();
  const [txns, setTxns] = useState<Transaction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.queryTransactions({ limit: 10_000 }).then((p) => !cancelled && setTxns(p.items));
    return () => {
      cancelled = true;
    };
  }, [api, revision]);

  const streams = useMemo(() => (txns ? detectRecurring(txns) : []), [txns]);
  const subscriptions = streams.filter(isSubscription);
  const income = streams.filter((s) => s.direction === "inflow");
  const bills = streams.filter((s) => s.direction === "outflow" && !isSubscription(s));

  const sum = (xs: RecurringStream[]) => xs.reduce((a, s) => a + monthlyAmountCents(s), 0);
  const monthlySubs = sum(subscriptions);
  const monthlyBills = sum(bills);

  // "Coming up" — outflows due in the next 7 days.
  const upcoming = useMemo(() => {
    const today = todayISO();
    const horizon = addDays(today, 7);
    return streams
      .filter((s) => s.direction === "outflow" && s.status === "active" && s.nextDate >= today && s.nextDate <= horizon)
      .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  }, [streams]);
  const upcomingTotal = upcoming.reduce((a, s) => a + Math.abs(s.avgAmountCents), 0);

  if (!txns) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Recurring</div>
          <div className="page-sub">Subscriptions, bills and income we found repeating</div>
        </div>
      </div>

      {streams.length === 0 ? (
        <div className="cui-card empty">
          No recurring charges detected yet.
          <div className="muted" style={{ marginTop: 8 }}>
            They show up here once a merchant bills you a few times.
          </div>
        </div>
      ) : (
        <div className="grid" style={{ gap: 16 }}>
          {/* Coming up in the next 7 days */}
          <div className="cui-card">
            <div className="card-title" style={{ marginBottom: 6 }}>Coming up</div>
            <div style={{ fontSize: 15 }}>
              {upcoming.length === 0 ? (
                <span className="muted">Nothing due in the next 7 days.</span>
              ) : (
                <>
                  <strong>{upcoming.length}</strong> recurring charge{upcoming.length === 1 ? "" : "s"} for{" "}
                  <strong>{formatCurrency(upcomingTotal)}</strong> in the next 7 days.
                </>
              )}
            </div>
            {upcoming.length > 0 && (
              <div className="grid" style={{ gap: 2, marginTop: 10 }}>
                {upcoming.map((s) => {
                  const days = daysBetween(todayISO(), s.nextDate);
                  return (
                    <div key={s.key} className="recurring-row">
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        <MerchantLogo merchant={s.merchantName} />
                        <div style={{ minWidth: 0 }}>
                          <strong>{s.merchantName}</strong>
                          <div className="faint" style={{ fontSize: 12 }}>
                            {days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} · {formatDate(s.nextDate)}
                          </div>
                        </div>
                      </div>
                      <span className="amount">{formatCurrency(Math.abs(s.avgAmountCents))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-4">
            <Tile label="Subscriptions" value={formatCurrency(monthlySubs)} sub={`${subscriptions.length} active`} />
            <Tile label="Recurring bills" value={formatCurrency(monthlyBills)} sub={`${bills.length} billers`} />
            <Tile
              label="Monthly recurring"
              value={formatCurrency(monthlySubs + monthlyBills)}
              sub="out the door"
              cls="neg"
            />
            <Tile label="Recurring income" value={formatCurrency(sum(income))} sub={`${income.length} sources`} cls="pos" />
          </div>

          <StreamSection title="Subscriptions" icon="🔁" streams={subscriptions} catMap={catMap} />
          <StreamSection title="Bills" icon="🧾" streams={bills} catMap={catMap} />
          <StreamSection title="Income" icon="💰" streams={income} catMap={catMap} />
        </div>
      )}
    </>
  );
}

function Tile({ label, value, sub, cls }: { label: string; value: string; sub: string; cls?: string }) {
  return (
    <div className="cui-card">
      <div className="stat-label">{label}</div>
      <div className={`stat ${cls ?? ""}`} style={{ fontSize: 22 }}>{value}</div>
      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function StreamSection({
  title,
  icon,
  streams,
  catMap,
}: {
  title: string;
  icon: string;
  streams: RecurringStream[];
  catMap: ReturnType<typeof useCategoryMap>;
}) {
  if (streams.length === 0) return null;
  return (
    <div className="cui-card">
      <div className="card-title">{icon} {title}</div>
      <div className="grid" style={{ gap: 2 }}>
        {streams.map((s) => (
          <div key={s.key} className={`recurring-row${s.status === "inactive" ? " inactive" : ""}`}>
            <div className="row" style={{ gap: 10, minWidth: 0 }}>
              <MerchantLogo merchant={s.merchantName} />
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <strong>{s.merchantName}</strong>
                  {s.priceIncrease && (
                    <span className="cui-pill cui-pill--warn" title="Latest charge is higher than usual">
                      ↑ price up
                    </span>
                  )}
                  {s.status === "inactive" && <span className="cui-pill pill-neutral">Inactive</span>}
                </div>
                <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                  {cadenceLabel(s.cadence)} · {s.status === "active" ? `next ${formatDate(s.nextDate)}` : `last ${formatDate(s.lastDate)}`}
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <CategoryChip category={catMap.get(s.categoryId ?? "")} />
              <span className="amount" style={{ minWidth: 84 }}>{formatCurrency(Math.abs(s.avgAmountCents))}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
