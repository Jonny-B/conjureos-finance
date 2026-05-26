import { useEffect, useMemo, useState } from "react";
import { useFinance, useCategoryMap } from "../store/FinanceContext";
import type { CategorizationStatus, Page, Transaction, TransactionQuery } from "../api/types";
import { formatCurrency, formatDate } from "../lib/format";
import { CategoryChip, CategorySelect, StatusBadge } from "./common";

const STATUSES: CategorizationStatus[] = ["auto", "confirmed", "needs_review", "uncategorized"];

export function Transactions() {
  const { api, categories, accounts, refresh, revision } = useFinance();
  const catMap = useCategoryMap();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [sort, setSort] = useState<TransactionQuery["sort"]>("date_desc");
  const [page, setPage] = useState<Page<Transaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const query = useMemo<TransactionQuery>(
    () => ({
      search: debounced || undefined,
      categoryIds: categoryId ? [categoryId] : undefined,
      accountIds: accountId ? [accountId] : undefined,
      status: status ? [status as CategorizationStatus] : undefined,
      sort,
      limit: 100,
    }),
    [debounced, categoryId, accountId, status, sort],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .queryTransactions(query)
      .then((p) => !cancelled && setPage(p))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, query, revision]);

  async function recategorize(id: string, newCat: string | null) {
    await api.setTransactionCategory(id, newCat);
    setEditing(null);
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Transactions</div>
          <div className="page-sub">{page ? `${page.total} matching` : "—"}</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="cui-input"
          placeholder="Search merchant or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="cui-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select className="cui-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ··{a.mask}
            </option>
          ))}
        </select>
        <select className="cui-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select className="cui-input" value={sort} onChange={(e) => setSort(e.target.value as TransactionQuery["sort"])}>
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="amount_asc">Amount ↑ (spend)</option>
          <option value="amount_desc">Amount ↓ (income)</option>
        </select>
      </div>

      <div className="cui-card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Category</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {page?.items.map((t) => (
              <tr key={t.id}>
                <td className="faint" style={{ whiteSpace: "nowrap" }}>{formatDate(t.date)}</td>
                <td>
                  <div>{t.merchantName}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{t.rawDescription}</div>
                </td>
                <td>
                  {editing === t.id ? (
                    <div style={{ maxWidth: 220 }}>
                      <CategorySelect
                        value={t.categorization.categoryId}
                        onChange={(c) => recategorize(t.id, c)}
                      />
                    </div>
                  ) : (
                    <button className="cui-button cui-button--ghost btn-sm" onClick={() => setEditing(t.id)} title="Recategorize">
                      <CategoryChip category={catMap.get(t.categorization.categoryId ?? "")} />
                    </button>
                  )}
                </td>
                <td>
                  <StatusBadge status={t.categorization.status} confidence={t.categorization.confidence} />
                </td>
                <td className={`amount ${t.amountCents >= 0 ? "pos" : ""}`}>
                  {formatCurrency(t.amountCents)}
                </td>
              </tr>
            ))}
            {!loading && page?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">No transactions match your filters.</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="empty">Loading…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
