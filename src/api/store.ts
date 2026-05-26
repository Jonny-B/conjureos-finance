// Pure, in-memory domain store: queries, mutations and analytics over a set of
// transactions/categories/budgets. No persistence concern lives here — the
// mock api uses it directly, and the synced (encrypted) api uses it as the
// decrypted working set and persists changes by re-encrypting + pushing.

import type {
  Account,
  Budget,
  Category,
  CategorySpend,
  DashboardSummary,
  DateRange,
  MonthlyPoint,
  Page,
  Transaction,
  TransactionQuery,
} from "./types";

export interface StoreState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
}

export class LocalStore {
  private accounts: Account[];
  private categories: Category[];
  private txns: Map<string, Transaction>;
  private budgets: Map<string, Budget>;

  constructor(state: StoreState) {
    this.accounts = state.accounts;
    this.categories = state.categories;
    this.txns = new Map(state.transactions.map((t) => [t.id, t]));
    this.budgets = new Map(state.budgets.map((b) => [b.id, b]));
  }

  // ---- accounts / categories -------------------------------------------
  listAccounts(): Account[] {
    return [...this.accounts];
  }

  listCategories(): Category[] {
    return [...this.categories];
  }

  getCategory(id: string | null): Category | undefined {
    return id ? this.categories.find((c) => c.id === id) : undefined;
  }

  addCategory(cat: Category) {
    this.categories.push(cat);
  }

  updateCategory(id: string, patch: Partial<Category>): Category {
    const idx = this.categories.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error("category not found");
    this.categories[idx] = { ...this.categories[idx], ...patch, id };
    return this.categories[idx];
  }

  removeCategory(id: string) {
    this.categories = this.categories.filter((c) => c.id !== id);
    // Orphan any transactions pointing at it.
    for (const t of this.txns.values()) {
      if (t.categorization.categoryId === id) {
        t.categorization = { ...t.categorization, categoryId: null, status: "uncategorized" };
      }
    }
  }

  // ---- transactions ----------------------------------------------------
  allTransactions(): Transaction[] {
    return [...this.txns.values()];
  }

  getTransaction(id: string): Transaction | undefined {
    return this.txns.get(id);
  }

  upsertTransaction(t: Transaction) {
    this.txns.set(t.id, t);
  }

  query(q: TransactionQuery): Page<Transaction> {
    let rows = [...this.txns.values()];
    const search = q.search?.trim().toLowerCase();
    if (search) {
      rows = rows.filter(
        (t) =>
          t.merchantName.toLowerCase().includes(search) ||
          t.rawDescription.toLowerCase().includes(search),
      );
    }
    if (q.categoryIds?.length) {
      const set = new Set(q.categoryIds);
      rows = rows.filter((t) => t.categorization.categoryId && set.has(t.categorization.categoryId));
    }
    if (q.accountIds?.length) {
      const set = new Set(q.accountIds);
      rows = rows.filter((t) => set.has(t.accountId));
    }
    if (q.status?.length) {
      const set = new Set(q.status);
      rows = rows.filter((t) => set.has(t.categorization.status));
    }
    if (q.dateFrom) rows = rows.filter((t) => t.date >= q.dateFrom!);
    if (q.dateTo) rows = rows.filter((t) => t.date <= q.dateTo!);
    if (q.minAmountCents != null) rows = rows.filter((t) => t.amountCents >= q.minAmountCents!);
    if (q.maxAmountCents != null) rows = rows.filter((t) => t.amountCents <= q.maxAmountCents!);
    if (q.spendOnly === true) rows = rows.filter((t) => t.amountCents < 0);
    if (q.spendOnly === false) rows = rows.filter((t) => t.amountCents > 0);

    const sort = q.sort ?? "date_desc";
    rows.sort((a, b) => {
      switch (sort) {
        case "date_asc":
          return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        case "amount_desc":
          return b.amountCents - a.amountCents;
        case "amount_asc":
          return a.amountCents - b.amountCents;
        case "date_desc":
        default:
          return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      }
    });

    const total = rows.length;
    const limit = q.limit ?? 50;
    const start = q.cursor ? Number(q.cursor) : 0;
    const items = rows.slice(start, start + limit);
    const nextCursor = start + limit < total ? String(start + limit) : null;
    return { items, nextCursor, total };
  }

  reviewQueue(): Transaction[] {
    return [...this.txns.values()]
      .filter((t) => t.categorization.status === "needs_review")
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  // ---- budgets ---------------------------------------------------------
  listBudgets(): Budget[] {
    return [...this.budgets.values()];
  }

  upsertBudget(b: Budget) {
    this.budgets.set(b.id, b);
  }

  removeBudget(id: string) {
    this.budgets.delete(id);
  }

  // ---- analytics -------------------------------------------------------
  dashboard(range: DateRange): DashboardSummary {
    const inRange = [...this.txns.values()].filter((t) => t.date >= range.from && t.date <= range.to);

    let totalSpent = 0;
    let totalIncome = 0;
    const byCat = new Map<string, CategorySpend>();
    const byMonth = new Map<string, MonthlyPoint>();
    const byMerchant = new Map<string, { merchantName: string; spentCents: number; txnCount: number }>();

    for (const t of inRange) {
      const month = t.date.slice(0, 7);
      const mp = byMonth.get(month) ?? { month, spentCents: 0, incomeCents: 0 };
      if (t.amountCents < 0) {
        const spend = -t.amountCents;
        totalSpent += spend;
        mp.spentCents += spend;

        const catId = t.categorization.categoryId ?? "uncategorized";
        const cat = this.getCategory(t.categorization.categoryId);
        const cs = byCat.get(catId) ?? {
          categoryId: catId,
          categoryName: cat?.name ?? "Uncategorized",
          color: cat?.color ?? "#475569",
          spentCents: 0,
          txnCount: 0,
        };
        cs.spentCents += spend;
        cs.txnCount += 1;
        byCat.set(catId, cs);

        const mer = byMerchant.get(t.merchantName) ?? { merchantName: t.merchantName, spentCents: 0, txnCount: 0 };
        mer.spentCents += spend;
        mer.txnCount += 1;
        byMerchant.set(t.merchantName, mer);
      } else {
        totalIncome += t.amountCents;
        mp.incomeCents += t.amountCents;
      }
      byMonth.set(month, mp);
    }

    return {
      rangeStart: range.from,
      rangeEnd: range.to,
      totalSpentCents: totalSpent,
      totalIncomeCents: totalIncome,
      netCents: totalIncome - totalSpent,
      byCategory: [...byCat.values()].sort((a, b) => b.spentCents - a.spentCents),
      monthly: [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
      topMerchants: [...byMerchant.values()].sort((a, b) => b.spentCents - a.spentCents).slice(0, 8),
    };
  }

  snapshot(): StoreState {
    return {
      accounts: this.listAccounts(),
      categories: this.listCategories(),
      transactions: this.allTransactions(),
      budgets: this.listBudgets(),
    };
  }
}
