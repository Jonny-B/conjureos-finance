// End-to-end encrypted FinanceApi.
//
// Pulls encrypted records from a SyncTransport, decrypts them in-memory into a
// LocalStore (the decrypted working set), serves the UI from that store, and on
// every mutation re-encrypts the affected entity and pushes ciphertext back.
// The server only ever holds opaque ids + AES-GCM blobs.

import { FinanceApiError, type FinanceApi } from "../contract";
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
} from "../mock/data";
import type { PushItem, RecordKind, SyncTransport } from "../sync/transport";
import { decryptJSON, encryptJSON } from "../../crypto/crypto";
import type { Vault } from "../../crypto/vault";

let nextId = 1;
const genId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${nextId++}`;

export class SyncedFinanceApi implements FinanceApi {
  private store: LocalStore | null = null;
  private cursor: string | null = null;
  private versions = new Map<string, number>(); // "kind:id" -> version
  private initializing: Promise<void> | null = null;

  constructor(
    private transport: SyncTransport,
    private vault: Vault,
  ) {}

  // ---- lifecycle -------------------------------------------------------
  async ready(): Promise<void> {
    if (this.store) return;
    if (!this.vault.isUnlocked) throw new FinanceApiError("vault locked", "locked");
    if (!this.initializing) this.initializing = this.hydrate();
    await this.initializing;
  }

  private vkey(kind: RecordKind, id: string) {
    return `${kind}:${id}`;
  }

  private async hydrate(): Promise<void> {
    const key = this.vault.getKey();
    const pulled = await this.transport.pull(this.cursor);
    this.cursor = pulled.cursor;

    const accounts: Account[] = [];
    const categories: Category[] = [];
    const transactions: Transaction[] = [];
    const budgets: Budget[] = [];
    const manualAssets: ManualAsset[] = [];
    const savingsGoals: SavingsGoal[] = [];

    for (const rec of pulled.records) {
      this.versions.set(this.vkey(rec.kind, rec.id), rec.version);
      if (rec.deleted || !rec.ciphertext || !rec.iv) continue;
      const value = await decryptJSON<unknown>(key, { ciphertext: rec.ciphertext, iv: rec.iv });
      switch (rec.kind) {
        case "account":
          accounts.push(value as Account);
          break;
        case "category":
          categories.push(value as Category);
          break;
        case "transaction":
          transactions.push(value as Transaction);
          break;
        case "budget":
          budgets.push(value as Budget);
          break;
        case "manual_asset":
          manualAssets.push(value as ManualAsset);
          break;
        case "savings_goal":
          savingsGoals.push(value as SavingsGoal);
          break;
      }
    }

    if (pulled.records.length === 0) {
      // First run for this vault: seed a starter dataset and persist it
      // encrypted. (When Plaid is wired this is where the initial import lands.)
      this.store = new LocalStore({
        accounts: ACCOUNTS,
        categories: [...SYSTEM_CATEGORIES],
        transactions: buildSeedTransactions(),
        budgets: [...SEED_BUDGETS],
        manualAssets: [...SEED_MANUAL_ASSETS],
        savingsGoals: [...SEED_GOALS],
      });
      await this.persistAll();
    } else {
      // Always ensure system categories exist even if a custom set was synced.
      const haveSystem = new Set(categories.map((c) => c.id));
      for (const sys of SYSTEM_CATEGORIES) if (!haveSystem.has(sys.id)) categories.push(sys);
      this.store = new LocalStore({ accounts, categories, transactions, budgets, manualAssets, savingsGoals });
    }
  }

  private requireStore(): LocalStore {
    if (!this.store) throw new FinanceApiError("not ready", "locked");
    return this.store;
  }

  // ---- persistence helpers ---------------------------------------------
  private async persist(kind: RecordKind, id: string, value: unknown): Promise<void> {
    const key = this.vault.getKey();
    const vk = this.vkey(kind, id);
    const version = (this.versions.get(vk) ?? 0) + 1;
    const sealed = await encryptJSON(key, value);
    const item: PushItem = { kind, id, ciphertext: sealed.ciphertext, iv: sealed.iv, version, deleted: false };
    const [rec] = await this.transport.push([item]);
    this.versions.set(vk, rec?.version ?? version);
  }

  private async tombstone(kind: RecordKind, id: string): Promise<void> {
    const vk = this.vkey(kind, id);
    const version = (this.versions.get(vk) ?? 0) + 1;
    const item: PushItem = { kind, id, ciphertext: null, iv: null, version, deleted: true };
    const [rec] = await this.transport.push([item]);
    this.versions.set(vk, rec?.version ?? version);
  }

  private async persistAll(): Promise<void> {
    const s = this.requireStore();
    const items: { kind: RecordKind; id: string; value: unknown }[] = [];
    for (const a of s.listAccounts()) items.push({ kind: "account", id: a.id, value: a });
    for (const c of s.listCategories()) items.push({ kind: "category", id: c.id, value: c });
    for (const t of s.allTransactions()) items.push({ kind: "transaction", id: t.id, value: t });
    for (const b of s.listBudgets()) items.push({ kind: "budget", id: b.id, value: b });
    for (const a of s.listManualAssets()) items.push({ kind: "manual_asset", id: a.id, value: a });
    for (const g of s.listSavingsGoals()) items.push({ kind: "savings_goal", id: g.id, value: g });
    // Persist sequentially to keep memory + payloads modest; fine for seed size.
    for (const it of items) await this.persist(it.kind, it.id, it.value);
  }

  // ---- accounts / categories -------------------------------------------
  async listAccounts(): Promise<Account[]> {
    await this.ready();
    return this.requireStore().listAccounts();
  }

  async listCategories(): Promise<Category[]> {
    await this.ready();
    return this.requireStore().listCategories();
  }

  async createCategory(input: Omit<Category, "id" | "isSystem">): Promise<Category> {
    await this.ready();
    const cat: Category = { ...input, id: genId("cat"), isSystem: false };
    this.requireStore().addCategory(cat);
    await this.persist("category", cat.id, cat);
    return cat;
  }

  async updateCategory(id: string, patch: Partial<Omit<Category, "id" | "isSystem">>): Promise<Category> {
    await this.ready();
    const cat = this.requireStore().updateCategory(id, patch);
    await this.persist("category", cat.id, cat);
    return cat;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.ready();
    this.requireStore().removeCategory(id);
    await this.tombstone("category", id);
  }

  // ---- transactions ----------------------------------------------------
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
    const s = this.requireStore();
    const t = s.getTransaction(id);
    if (!t) throw new FinanceApiError("transaction not found", "not_found");
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
    s.upsertTransaction(updated);
    await this.persist("transaction", id, updated);
    return updated;
  }

  async applyCategorizations(updates: Parameters<FinanceApi["applyCategorizations"]>[0]): Promise<void> {
    await this.ready();
    const s = this.requireStore();
    for (const u of updates) {
      const t = s.getTransaction(u.id);
      if (!t) continue;
      const updated: Transaction = {
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
      };
      s.upsertTransaction(updated);
      await this.persist("transaction", u.id, updated);
    }
  }

  async listReviewQueue(): Promise<Transaction[]> {
    await this.ready();
    return this.requireStore().reviewQueue();
  }

  // ---- budgets ---------------------------------------------------------
  async listBudgets(): Promise<Budget[]> {
    await this.ready();
    return this.requireStore().listBudgets();
  }

  async upsertBudget(input: Omit<Budget, "id"> & { id?: string }): Promise<Budget> {
    await this.ready();
    const budget: Budget = { ...input, id: input.id ?? genId("bud") };
    this.requireStore().upsertBudget(budget);
    await this.persist("budget", budget.id, budget);
    return budget;
  }

  async deleteBudget(id: string): Promise<void> {
    await this.ready();
    this.requireStore().removeBudget(id);
    await this.tombstone("budget", id);
  }

  // ---- manual assets ---------------------------------------------------
  async listManualAssets(): Promise<ManualAsset[]> {
    await this.ready();
    return this.requireStore().listManualAssets();
  }

  async upsertManualAsset(input: Omit<ManualAsset, "id"> & { id?: string }): Promise<ManualAsset> {
    await this.ready();
    const asset: ManualAsset = { ...input, id: input.id ?? genId("asset") };
    this.requireStore().upsertManualAsset(asset);
    await this.persist("manual_asset", asset.id, asset);
    return asset;
  }

  async deleteManualAsset(id: string): Promise<void> {
    await this.ready();
    this.requireStore().removeManualAsset(id);
    await this.tombstone("manual_asset", id);
  }

  // ---- savings goals ---------------------------------------------------
  async listSavingsGoals(): Promise<SavingsGoal[]> {
    await this.ready();
    return this.requireStore().listSavingsGoals();
  }

  async upsertSavingsGoal(
    input: Omit<SavingsGoal, "id" | "createdAt"> & { id?: string },
  ): Promise<SavingsGoal> {
    await this.ready();
    const s = this.requireStore();
    const existing = input.id ? s.listSavingsGoals().find((g) => g.id === input.id) : undefined;
    const goal: SavingsGoal = {
      ...input,
      id: input.id ?? genId("goal"),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    s.upsertSavingsGoal(goal);
    await this.persist("savings_goal", goal.id, goal);
    return goal;
  }

  async deleteSavingsGoal(id: string): Promise<void> {
    await this.ready();
    this.requireStore().removeSavingsGoal(id);
    await this.tombstone("savings_goal", id);
  }

  // ---- analytics -------------------------------------------------------
  async getDashboard(range: DateRange): Promise<DashboardSummary> {
    await this.ready();
    return this.requireStore().dashboard(range);
  }
}
