import { describe, expect, it } from "vitest";
import { MockFinanceApi } from "../mock/mockApi";
import { SyncedFinanceApi } from "../synced/syncedApi";
import { MockSyncTransport } from "../sync/mockTransport";
import { Vault } from "../../crypto/vault";
import { CategorizationOrchestrator } from "../../orchestrator/categorizer";
import { HeuristicProvider } from "../../orchestrator/inference/heuristicProvider";
import { encryptJSON, decryptJSON, deriveKey, newSalt } from "../../crypto/crypto";

const FIXED = new Date("2026-05-26T00:00:00Z");

describe("MockFinanceApi", () => {
  it("seeds a multi-month dataset and queries it", async () => {
    const api = new MockFinanceApi(FIXED);
    const page = await api.queryTransactions({ limit: 1000 });
    expect(page.total).toBeGreaterThan(50);
    const cats = await api.listCategories();
    expect(cats.find((c) => c.id === "cat_groceries")).toBeTruthy();
  });

  it("free-text search matches merchant and raw descriptor", async () => {
    const api = new MockFinanceApi(FIXED);
    const page = await api.queryTransactions({ search: "whole foods", limit: 1000 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((t) => /whole/i.test(t.merchantName + t.rawDescription))).toBe(true);
  });

  it("computes a dashboard with category + monthly breakdowns", async () => {
    const api = new MockFinanceApi(FIXED);
    const dash = await api.getDashboard({ from: "2026-01-01", to: "2026-12-31" });
    expect(dash.totalSpentCents).toBeGreaterThan(0);
    expect(dash.totalIncomeCents).toBeGreaterThan(0);
    expect(dash.byCategory.length).toBeGreaterThan(3);
    expect(dash.monthly.length).toBeGreaterThan(0);
  });

  it("surfaces a review queue and lets a human confirm", async () => {
    const api = new MockFinanceApi(FIXED);
    const queue = await api.listReviewQueue();
    expect(queue.length).toBeGreaterThan(0);
    const t = queue[0];
    const updated = await api.setTransactionCategory(t.id, "cat_dining");
    expect(updated.categorization.status).toBe("confirmed");
    const after = await api.listReviewQueue();
    expect(after.find((x) => x.id === t.id)).toBeUndefined();
  });
});

describe("CategorizationOrchestrator (heuristic)", () => {
  it("auto-applies confident matches and flags the rest", async () => {
    const api = new MockFinanceApi(FIXED);
    const orch = new CategorizationOrchestrator(api, new HeuristicProvider());
    const cats = await api.listCategories();
    const all = await api.queryTransactions({ limit: 10000 });
    const result = await orch.run(cats, all.items);
    expect(result.processed).toBeGreaterThan(0);
    expect(result.autoApplied).toBeGreaterThan(0);
    // PAYPAL *MKTPL has no rule -> should be flagged for review.
    const review = await api.listReviewQueue();
    expect(review.some((t) => t.merchantName.includes("PAYPAL"))).toBe(true);
  });
});

describe("crypto", () => {
  it("round-trips JSON through AES-GCM", async () => {
    const key = await deriveKey("correct horse battery staple", newSalt());
    const sealed = await encryptJSON(key, { hello: "world", n: 42 });
    expect(typeof sealed.ciphertext).toBe("string");
    const back = await decryptJSON<{ hello: string; n: number }>(key, sealed);
    expect(back).toEqual({ hello: "world", n: 42 });
  });
});

describe("SyncedFinanceApi (E2E path over mock transport)", () => {
  it("seeds, encrypts, persists and re-reads through the vault", async () => {
    const transport = new MockSyncTransport();
    const vault = new Vault();
    await vault.initialize("pa55phrase");

    const api = new SyncedFinanceApi(transport, vault);
    await api.ready();
    const page = await api.queryTransactions({ limit: 1000 });
    expect(page.total).toBeGreaterThan(50);

    // A fresh client with the SAME transport + vault key should decrypt the data.
    const vault2 = new Vault();
    await vault2.unlock("pa55phrase");
    const api2 = new SyncedFinanceApi(transport, vault2);
    await api2.ready();
    const page2 = await api2.queryTransactions({ limit: 1000 });
    expect(page2.total).toBe(page.total);
  });

  it("refuses to operate while locked", async () => {
    const api = new SyncedFinanceApi(new MockSyncTransport(), new Vault());
    await expect(api.ready()).rejects.toThrow(/lock/i);
  });
});
