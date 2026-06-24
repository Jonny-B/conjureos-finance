// In-memory FinanceApi. No backend, no crypto, no network. This is what runs
// when VITE_FINANCE_API=mock (the default) and is the surface contributors
// build against.

import type { FinanceApi } from "../contract";
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
} from "../types";
import { LocalStore } from "../store";
import {
  ACCOUNTS,
  SEED_BUDGETS,
  SEED_GOALS,
  SEED_MANUAL_ASSETS,
  SYSTEM_CATEGORIES,
  buildSeedTransactions,
} from "./data";

let nextId = 1;
const genId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${nextId++}`;

// Simulated network latency so loading states are exercised in dev.
const LATENCY_MS = 120;
const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));

export class MockFinanceApi implements FinanceApi {
  private store: LocalStore;

  constructor(anchor = new Date()) {
    this.store = new LocalStore({
      accounts: ACCOUNTS,
      categories: [...SYSTEM_CATEGORIES],
      transactions: buildSeedTransactions(anchor),
      budgets: [...SEED_BUDGETS],
      manualAssets: [...SEED_MANUAL_ASSETS],
      savingsGoals: [...SEED_GOALS],
    });
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  listAccounts(): Promise<Account[]> {
    return delay(this.store.listAccounts());
  }

  listCategories(): Promise<Category[]> {
    return delay(this.store.listCategories());
  }

  async createCategory(input: Omit<Category, "id" | "isSystem">): Promise<Category> {
    const cat: Category = { ...input, id: genId("cat"), isSystem: false };
    this.store.addCategory(cat);
    return delay(cat);
  }

  updateCategory(id: string, patch: Partial<Omit<Category, "id" | "isSystem">>): Promise<Category> {
    return delay(this.store.updateCategory(id, patch));
  }

  async deleteCategory(id: string): Promise<void> {
    this.store.removeCategory(id);
    return delay(undefined);
  }

  queryTransactions(query: TransactionQuery): Promise<Page<Transaction>> {
    return delay(this.store.query(query));
  }

  async getTransaction(id: string): Promise<Transaction> {
    const t = this.store.getTransaction(id);
    if (!t) throw new Error("transaction not found");
    return delay(t);
  }

  async setTransactionCategory(id: string, categoryId: string | null): Promise<Transaction> {
    const t = this.store.getTransaction(id);
    if (!t) throw new Error("transaction not found");
    const updated: Transaction = {
      ...t,
      categorization: {
        ...t.categorization,
        categoryId,
        status: "confirmed",
        confidence: 1,
        decidedAt: new Date().toISOString(),
      },
    };
    this.store.upsertTransaction(updated);
    return delay(updated);
  }

  async applyCategorizations(
    updates: Parameters<FinanceApi["applyCategorizations"]>[0],
  ): Promise<void> {
    for (const u of updates) {
      const t = this.store.getTransaction(u.id);
      if (!t) continue;
      this.store.upsertTransaction({
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
    return delay(undefined);
  }

  listReviewQueue(): Promise<Transaction[]> {
    return delay(this.store.reviewQueue());
  }

  listBudgets(): Promise<Budget[]> {
    return delay(this.store.listBudgets());
  }

  async upsertBudget(input: Omit<Budget, "id"> & { id?: string }): Promise<Budget> {
    const budget: Budget = { ...input, id: input.id ?? genId("bud") };
    this.store.upsertBudget(budget);
    return delay(budget);
  }

  async deleteBudget(id: string): Promise<void> {
    this.store.removeBudget(id);
    return delay(undefined);
  }

  // ---- manual assets ---------------------------------------------------
  listManualAssets(): Promise<ManualAsset[]> {
    return delay(this.store.listManualAssets());
  }

  async upsertManualAsset(input: Omit<ManualAsset, "id"> & { id?: string }): Promise<ManualAsset> {
    const asset: ManualAsset = { ...input, id: input.id ?? genId("asset") };
    this.store.upsertManualAsset(asset);
    return delay(asset);
  }

  async deleteManualAsset(id: string): Promise<void> {
    this.store.removeManualAsset(id);
    return delay(undefined);
  }

  // ---- savings goals ---------------------------------------------------
  listSavingsGoals(): Promise<SavingsGoal[]> {
    return delay(this.store.listSavingsGoals());
  }

  async upsertSavingsGoal(
    input: Omit<SavingsGoal, "id" | "createdAt"> & { id?: string },
  ): Promise<SavingsGoal> {
    const existing = input.id ? this.store.listSavingsGoals().find((g) => g.id === input.id) : undefined;
    const goal: SavingsGoal = {
      ...input,
      id: input.id ?? genId("goal"),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    this.store.upsertSavingsGoal(goal);
    return delay(goal);
  }

  async deleteSavingsGoal(id: string): Promise<void> {
    this.store.removeSavingsGoal(id);
    return delay(undefined);
  }

  getDashboard(range: DateRange): Promise<DashboardSummary> {
    return delay(this.store.dashboard(range));
  }
}
