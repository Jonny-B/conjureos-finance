// REST-backed FinanceApi. Reads from the `finance.*` PostgREST surface
// (Plaid-fed accounts/transactions/budgets, RLS-scoped to the caller),
// keeps the working set in a LocalStore for fast in-memory queries, and
// writes back through PostgREST for the column-level mutations the
// schema allows: budgets (full CRUD) and transactions.user_category.
//
// Categories are CLIENT-LOCAL: SYSTEM_CATEGORIES at the bottom + a synthetic
// row for any Plaid category we see that doesn't map to a system slot.
// Migration 035 doesn't have a categories table on purpose (the migration
// notes say category authoring stays client-side for now), so creating /
// renaming user categories isn't persisted across devices. The mapping
// from Plaid PFC primaries -> system category ids is the source of truth
// for which budget bucket transactions land in.
//
// Why not the Edge Functions: account + transaction reads are
// high-traffic; pushing every fetch through Deno would add latency and
// cold-start risk without any security gain (PostgREST already enforces
// RLS). The Plaid LIFECYCLE (link/exchange/sync/unlink) goes through
// Edge Functions because those calls hold the Plaid secret and need
// Vault writes.
//
// PostgREST schema header: every call carries `Accept-Profile: finance`
// (reads) and `Content-Profile: finance` (writes) so we don't have to
// hard-code finance as the default schema for the whole client. The
// `finance` schema must be added to Project Settings -> API -> Exposed
// schemas in the Supabase dashboard for these calls to land.

import { FinanceApiError, type FinanceApi } from "../contract";
import type {
  Account,
  AccountType,
  Budget,
  Categorization,
  Category,
  CategorizationStatus,
  DashboardSummary,
  DateRange,
  Page,
  Transaction,
  TransactionQuery,
} from "../types";
import { LocalStore } from "../store";
import { SYSTEM_CATEGORIES } from "../mock/data";

const PFC_TO_SYSTEM: Record<string, string> = {
  INCOME: "cat_income",
  FOOD_AND_DRINK: "cat_dining",
  GENERAL_MERCHANDISE: "cat_shopping",
  HOME_IMPROVEMENT: "cat_housing",
  RENT_AND_UTILITIES: "cat_bills",
  MEDICAL: "cat_health",
  PERSONAL_CARE: "cat_health",
  ENTERTAINMENT: "cat_entertainment",
  TRAVEL: "cat_travel",
  TRANSPORTATION: "cat_transport",
  BANK_FEES: "cat_fees",
  // INCOME-like flows tagged transfer end up "uncategorized" rather than
  // mis-mapped to a spending bucket; intentional.
};

function plaidTypeToAccountType(type: string | null, subtype: string | null): AccountType {
  const t = (type ?? "").toLowerCase();
  const s = (subtype ?? "").toLowerCase();
  if (t === "credit" || s.includes("credit card")) return "credit";
  if (t === "investment" || t === "brokerage") return "investment";
  if (t === "loan") return "loan";
  if (t === "depository") {
    if (s === "savings") return "savings";
    if (s === "checking" || s === "money market" || s === "cd") return "checking";
    if (s === "cash management" || s === "paypal") return "cash";
    return "checking";
  }
  return "cash";
}

export interface RestApiConfig {
  /** Supabase project URL (no trailing /rest/v1). */
  baseUrl: string;
  anonKey: string;
  getAccessToken: () => string | null | Promise<string | null>;
}

interface PgAccountRow {
  id: string;
  item_id: string;
  plaid_account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: string | number | null;
  iso_currency_code: string | null;
  plaid_items?: { institution_name: string | null } | { institution_name: string | null }[] | null;
}

interface PgTransactionRow {
  id: string;
  account_id: string;
  plaid_transaction_id: string;
  posted_at: string;
  amount: string | number;
  merchant_name: string | null;
  name: string;
  category_primary: string | null;
  user_category: string | null;
  pending: boolean;
}

interface PgBudgetRow {
  id: string;
  category: string;
  amount: string | number;
  period: "monthly";
}

const toCents = (n: string | number | null | undefined): number => {
  if (n == null) return 0;
  const num = typeof n === "string" ? parseFloat(n) : n;
  return Math.round(num * 100);
};

export class RestFinanceApi implements FinanceApi {
  private store: LocalStore | null = null;
  private hydrating: Promise<void> | null = null;
  /** category ids that exist in SYSTEM_CATEGORIES plus any synthetic ones added on hydrate. */
  private syntheticCategories = new Map<string, Category>();

  constructor(private cfg: RestApiConfig) {}

  // ---- transport -------------------------------------------------------
  private async headers(write: boolean): Promise<Record<string, string>> {
    const token = await this.cfg.getAccessToken();
    if (!token) throw new FinanceApiError("not signed in", "unauthorized");
    const h: Record<string, string> = {
      apikey: this.cfg.anonKey,
      authorization: `Bearer ${token}`,
      "Accept-Profile": "finance",
    };
    if (write) {
      h["Content-Type"] = "application/json";
      h["Content-Profile"] = "finance";
      h.Prefer = "return=representation";
    }
    return h;
  }

  private async restGet<T>(path: string): Promise<T> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: await this.headers(false) });
    } catch (e) {
      throw new FinanceApiError("network error", "network", e);
    }
    if (res.status === 401 || res.status === 403) throw new FinanceApiError("unauthorized", "unauthorized");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new FinanceApiError(`rest GET ${path} failed (${res.status}): ${body.slice(0, 200)}`, "unknown");
    }
    return (await res.json()) as T;
  }

  private async restMutate<T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T | null> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: await this.headers(true),
        body: body == null ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new FinanceApiError("network error", "network", e);
    }
    if (res.status === 401 || res.status === 403) throw new FinanceApiError("unauthorized", "unauthorized");
    if (res.status === 204) return null;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new FinanceApiError(`rest ${method} ${path} failed (${res.status}): ${txt.slice(0, 200)}`, "unknown");
    }
    return (await res.json()) as T;
  }

  // ---- lifecycle -------------------------------------------------------
  async ready(): Promise<void> {
    if (this.store) return;
    if (!this.hydrating) this.hydrating = this.hydrate();
    await this.hydrating;
  }

  private async hydrate(): Promise<void> {
    // Embedded join pulls plaid_items.institution_name in one round-trip.
    const accountRows = await this.restGet<PgAccountRow[]>(
      "accounts?select=id,item_id,plaid_account_id,name,official_name,mask,type,subtype,current_balance,iso_currency_code,plaid_items(institution_name)",
    );
    const txnRows = await this.restGet<PgTransactionRow[]>(
      "transactions?select=id,account_id,plaid_transaction_id,posted_at,amount,merchant_name,name,category_primary,user_category,pending&order=posted_at.desc&limit=10000",
    );
    const budgetRows = await this.restGet<PgBudgetRow[]>(
      "budgets?select=id,category,amount,period",
    );

    const accounts: Account[] = accountRows.map(toDomainAccount);
    const transactions: Transaction[] = txnRows.map((t) =>
      toDomainTransaction(t, (id) => this.ensureCategoryExists(id)),
    );
    const budgets: Budget[] = budgetRows.map((b) => ({
      id: b.id,
      categoryId: b.category,
      period: b.period,
      limitCents: toCents(b.amount),
    }));

    const categories: Category[] = [
      ...SYSTEM_CATEGORIES,
      ...this.syntheticCategories.values(),
    ];

    this.store = new LocalStore({ accounts, categories, transactions, budgets });
  }

  private requireStore(): LocalStore {
    if (!this.store) throw new FinanceApiError("not ready", "unknown");
    return this.store;
  }

  /**
   * Ensures a category id is present in the local catalog so transaction
   * rows referencing a Plaid PFC primary we haven't mapped explicitly
   * still render with a label/color. Idempotent.
   */
  private ensureCategoryExists(id: string): string {
    if (SYSTEM_CATEGORIES.some((c) => c.id === id)) return id;
    if (this.syntheticCategories.has(id)) return id;
    this.syntheticCategories.set(id, {
      id,
      name: id.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()),
      color: "#94a3b8",
      icon: "🏷️",
      parentId: null,
      isSystem: false,
    });
    return id;
  }

  // ---- accounts / categories ------------------------------------------
  async listAccounts(): Promise<Account[]> {
    await this.ready();
    return this.requireStore().listAccounts();
  }

  async listCategories(): Promise<Category[]> {
    await this.ready();
    return this.requireStore().listCategories();
  }

  async createCategory(_input: Omit<Category, "id" | "isSystem">): Promise<Category> {
    // Categories aren't persisted server-side in this schema. Surface
    // honestly rather than silently dropping the write.
    throw new FinanceApiError("category authoring not supported in REST mode", "unknown");
  }

  async updateCategory(_id: string, _patch: Partial<Omit<Category, "id" | "isSystem">>): Promise<Category> {
    throw new FinanceApiError("category authoring not supported in REST mode", "unknown");
  }

  async deleteCategory(_id: string): Promise<void> {
    throw new FinanceApiError("category authoring not supported in REST mode", "unknown");
  }

  // ---- transactions ---------------------------------------------------
  async queryTransactions(query: TransactionQuery): Promise<Page<Transaction>> {
    await this.ready();
    return this.requireStore().query(query);
  }

  async getTransaction(id: string): Promise<Transaction> {
    await this.ready();
    const t = this.requireStore().getTransaction(id);
    if (!t) throw new FinanceApiError("transaction not found", "not_found");
    return t;
  }

  async setTransactionCategory(id: string, categoryId: string | null): Promise<Transaction> {
    await this.ready();
    const existing = this.requireStore().getTransaction(id);
    if (!existing) throw new FinanceApiError("transaction not found", "not_found");

    // user_category is the only column the client may UPDATE. RLS + column
    // GRANT (migration 035) keeps the surface narrow.
    await this.restMutate<PgTransactionRow[]>(
      "PATCH",
      `transactions?id=eq.${encodeURIComponent(id)}`,
      { user_category: categoryId },
    );

    const updated: Transaction = {
      ...existing,
      categorization: {
        ...existing.categorization,
        categoryId,
        status: categoryId ? "confirmed" : "uncategorized",
        confidence: 1,
        decidedAt: new Date().toISOString(),
      },
    };
    this.requireStore().upsertTransaction(updated);
    return updated;
  }

  async applyCategorizations(
    updates: Parameters<FinanceApi["applyCategorizations"]>[0],
  ): Promise<void> {
    // Sequential to keep the URL string sane; categorizer pass typically
    // touches the review queue (~tens of rows), not the full history.
    for (const u of updates) {
      try {
        await this.restMutate(
          "PATCH",
          `transactions?id=eq.${encodeURIComponent(u.id)}`,
          { user_category: u.categoryId },
        );
      } catch (e) {
        console.warn("[restApi] categorization PATCH failed for", u.id, e);
        continue;
      }
      const t = this.requireStore().getTransaction(u.id);
      if (!t) continue;
      this.requireStore().upsertTransaction({
        ...t,
        categorization: {
          categoryId: u.categoryId,
          status: u.status,
          confidence: u.confidence,
          suggestedCategoryId: u.suggestedCategoryId,
          reasoning: u.reasoning,
          orchestratorVersion: u.orchestratorVersion,
          decidedAt: new Date().toISOString(),
        },
      });
    }
  }

  async listReviewQueue(): Promise<Transaction[]> {
    await this.ready();
    return this.requireStore().reviewQueue();
  }

  // ---- budgets --------------------------------------------------------
  async listBudgets(): Promise<Budget[]> {
    await this.ready();
    return this.requireStore().listBudgets();
  }

  async upsertBudget(input: Omit<Budget, "id"> & { id?: string }): Promise<Budget> {
    await this.ready();
    const row = {
      category: input.categoryId,
      amount: input.limitCents / 100,
      period: input.period,
    };
    if (input.id) {
      const res = await this.restMutate<PgBudgetRow[]>(
        "PATCH",
        `budgets?id=eq.${encodeURIComponent(input.id)}`,
        row,
      );
      const got = res?.[0];
      const updated: Budget = {
        id: got?.id ?? input.id,
        categoryId: got?.category ?? input.categoryId,
        period: (got?.period as "monthly") ?? input.period,
        limitCents: toCents(got?.amount ?? input.limitCents / 100),
      };
      this.requireStore().upsertBudget(updated);
      return updated;
    }
    // Upsert on (user_id, category, period) — unique key in the schema.
    const res = await this.restMutate<PgBudgetRow[]>(
      "POST",
      `budgets?on_conflict=user_id,category,period`,
      row,
    );
    const got = res?.[0];
    const created: Budget = {
      id: got?.id ?? `bud_local_${Date.now()}`,
      categoryId: got?.category ?? input.categoryId,
      period: (got?.period as "monthly") ?? input.period,
      limitCents: toCents(got?.amount ?? input.limitCents / 100),
    };
    this.requireStore().upsertBudget(created);
    return created;
  }

  async deleteBudget(id: string): Promise<void> {
    await this.restMutate<null>("DELETE", `budgets?id=eq.${encodeURIComponent(id)}`);
    this.requireStore().removeBudget(id);
  }

  async getDashboard(range: DateRange): Promise<DashboardSummary> {
    await this.ready();
    return this.requireStore().dashboard(range);
  }
}

// ---- mappers ------------------------------------------------------------

function toDomainAccount(row: PgAccountRow): Account {
  const itemRel = row.plaid_items;
  const institutionName = Array.isArray(itemRel)
    ? (itemRel[0]?.institution_name ?? "Linked bank")
    : (itemRel?.institution_name ?? "Linked bank");
  // Credit-card balances out of Plaid are "amount you owe" (positive). The
  // domain model represents credit balances as negative cents (a debt), so
  // flip the sign for credit accounts on the way in.
  const accountType = plaidTypeToAccountType(row.type, row.subtype);
  const rawCents = toCents(row.current_balance);
  const signedCents = accountType === "credit" || accountType === "loan" ? -rawCents : rawCents;
  return {
    id: row.id,
    name: row.official_name ?? row.name,
    institution: institutionName,
    mask: row.mask ?? "",
    type: accountType,
    balanceCents: signedCents,
    currency: row.iso_currency_code ?? "USD",
  };
}

function toDomainTransaction(
  row: PgTransactionRow,
  ensureCategory: (id: string) => string,
): Transaction {
  // Plaid: positive = outflow (debit). Domain Cents: negative = money out.
  const amountCents = -toCents(row.amount);
  let categoryId: string | null = null;
  let status: CategorizationStatus = "uncategorized";
  let confidence = 0;
  if (row.user_category) {
    categoryId = row.user_category;
    status = "confirmed";
    confidence = 1;
    ensureCategory(row.user_category);
  } else if (row.category_primary) {
    const mapped = PFC_TO_SYSTEM[row.category_primary] ?? ensureCategory(row.category_primary);
    categoryId = mapped;
    status = "auto";
    confidence = 0.6;
  }
  const categorization: Categorization = {
    categoryId,
    status,
    confidence,
    suggestedCategoryId: categoryId,
    reasoning: row.category_primary ? `Plaid: ${row.category_primary}` : null,
    orchestratorVersion: null,
    decidedAt: null,
  };
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.posted_at,
    amountCents,
    merchantName: row.merchant_name ?? row.name,
    rawDescription: row.name,
    pending: row.pending,
    source: "plaid",
    categorization,
  };
}
