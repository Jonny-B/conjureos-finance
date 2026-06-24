import { useEffect, useMemo, useState } from "react";
import { useFinance, useCategoryMap } from "../store/FinanceContext";
import type { CategorizationStatus, Page, Transaction, TransactionQuery } from "../api/types";
import { monthKey } from "../analytics/dates";
import { formatCurrency, formatDate, monthLabel } from "../lib/format";
import { CategoryChip, CategorySelect, MerchantLogo, StatusBadge } from "./common";

const STATUSES: CategorizationStatus[] = ["auto", "confirmed", "needs_review", "uncategorized"];

interface Group {
  key: string;
  label: string;
  spentCents: number;
  items: Transaction[];
}

function groupByMonth(items: Transaction[]): Group[] {
  const groups: Group[] = [];
  const index = new Map<string, Group>();
  for (const t of items) {
    const key = monthKey(t.date);
    let g = index.get(key);
    if (!g) {
      g = { key, label: monthLabel(key), spentCents: 0, items: [] };
      index.set(key, g);
      groups.push(g);
    }
    g.items.push(t);
    if (t.amountCents < 0) g.spentCents += -t.amountCents;
  }
  return groups;
}

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
      limit: 200,
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

  const groups = useMemo(() => (page ? groupByMonth(page.items) : []), [page]);

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
          placeholder="Search my transactions…"
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

      {loading ? (
        <div className="cui-card empty">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="cui-card empty">No transactions match your filters.</div>
      ) : (
        <div className="grid" style={{ gap: 14 }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div className="txn-group-head">
                <span>{g.label}</span>
                <span className="tgh-total">{formatCurrency(g.spentCents)} spent</span>
              </div>
              <div className="cui-card" style={{ padding: "4px 14px" }}>
                {g.items.map((t) => {
                  const isEditing = editing === t.id;
                  return (
                    <div key={t.id}>
                      <button className="txn-row" onClick={() => setEditing(isEditing ? null : t.id)}>
                        <MerchantLogo merchant={t.merchantName} raw={t.rawDescription} />
                        <div style={{ minWidth: 0 }}>
                          <div className="txn-name">{t.merchantName}</div>
                          <div className="txn-date">
                            {formatDate(t.date)}
                            {t.pending && " · pending"}
                          </div>
                        </div>
                        <div className="txn-meta">
                          <span className="col-cat">
                            <CategoryChip category={catMap.get(t.categorization.categoryId ?? "")} />
                          </span>
                          <span className="col-status">
                            <StatusBadge status={t.categorization.status} confidence={t.categorization.confidence} />
                          </span>
                          <span className={`txn-amount ${t.amountCents >= 0 ? "pos" : ""}`}>
                            {formatCurrency(t.amountCents)}
                          </span>
                        </div>
                      </button>
                      {isEditing && (
                        <div className="txn-edit">
                          <div className="field">
                            <label>Category for {t.merchantName}</label>
                            <CategorySelect
                              value={t.categorization.categoryId}
                              onChange={(c) => recategorize(t.id, c)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
