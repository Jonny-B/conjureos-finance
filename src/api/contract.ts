// The robust, typed API layer the UI depends on.
//
// Everything above this line in the stack (components, hooks, charts) talks to
// `FinanceApi` and nothing else. Two interchangeable implementations exist:
//
//   - MockFinanceApi   (src/api/mock)   in-memory, no backend, no crypto
//   - SyncedFinanceApi (src/api/synced) E2E-encrypted sync over a SyncTransport
//
// Swapping them is a one-line change in src/api/index.ts, which is what lets a
// contributor build and improve the whole app without any backend access.

import type {
  Account,
  Budget,
  Category,
  DashboardSummary,
  DateRange,
  ManualAsset,
  Page,
  SavingsGoal,
  Transaction,
  TransactionQuery,
} from "./types";

export class FinanceApiError extends Error {
  constructor(
    message: string,
    readonly code:
      | "locked"
      | "not_found"
      | "network"
      | "conflict"
      | "unauthorized"
      | "unknown",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FinanceApiError";
  }
}

export interface FinanceApi {
  // --- accounts ----------------------------------------------------------
  listAccounts(): Promise<Account[]>;

  // --- categories --------------------------------------------------------
  listCategories(): Promise<Category[]>;
  createCategory(input: Omit<Category, "id" | "isSystem">): Promise<Category>;
  updateCategory(id: string, patch: Partial<Omit<Category, "id" | "isSystem">>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  // --- transactions ------------------------------------------------------
  queryTransactions(query: TransactionQuery): Promise<Page<Transaction>>;
  getTransaction(id: string): Promise<Transaction>;
  /** Human assigns/overrides a category. Marks the row "confirmed". */
  setTransactionCategory(id: string, categoryId: string | null): Promise<Transaction>;
  /** Bulk apply orchestrator output. Used by the categorization run. */
  applyCategorizations(
    updates: {
      id: string;
      categoryId: string | null;
      status: Transaction["categorization"]["status"];
      confidence: number;
      suggestedCategoryId: string | null;
      reasoning: string | null;
      orchestratorVersion: string;
    }[],
  ): Promise<void>;

  // --- review queue ------------------------------------------------------
  /** Transactions the orchestrator flagged as uncertain (status = needs_review). */
  listReviewQueue(): Promise<Transaction[]>;

  // --- budgets -----------------------------------------------------------
  listBudgets(): Promise<Budget[]>;
  upsertBudget(input: Omit<Budget, "id"> & { id?: string }): Promise<Budget>;
  deleteBudget(id: string): Promise<void>;

  // --- manual assets (net worth beyond linked accounts) ------------------
  listManualAssets(): Promise<ManualAsset[]>;
  upsertManualAsset(input: Omit<ManualAsset, "id"> & { id?: string }): Promise<ManualAsset>;
  deleteManualAsset(id: string): Promise<void>;

  // --- savings goals -----------------------------------------------------
  listSavingsGoals(): Promise<SavingsGoal[]>;
  upsertSavingsGoal(input: Omit<SavingsGoal, "id" | "createdAt"> & { id?: string }): Promise<SavingsGoal>;
  deleteSavingsGoal(id: string): Promise<void>;

  // --- analytics (computed client-side from decrypted data) --------------
  getDashboard(range: DateRange): Promise<DashboardSummary>;

  // --- lifecycle ---------------------------------------------------------
  /**
   * Ensures the local dataset is available. For the synced implementation this
   * pulls + decrypts; for the mock it's a no-op. Throws FinanceApiError("locked")
   * if an encrypted vault hasn't been unlocked yet.
   */
  ready(): Promise<void>;
}
