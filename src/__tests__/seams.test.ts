import { describe, expect, it } from "vitest";
import { enrichMerchant } from "../enrich/merchant";
import { bankProvider } from "../sync/bankProvider";

describe("enrichMerchant", () => {
  it("maps known merchants to a glyph + domain", () => {
    expect(enrichMerchant("Netflix", "NETFLIX.COM").domain).toBe("netflix.com");
    expect(enrichMerchant("Netflix").emoji).not.toBe("💳");
  });

  it("falls back to a generic glyph for unknown merchants", () => {
    const e = enrichMerchant("SQ *THE CORNER 99");
    expect(e.emoji).toBe("💳");
    expect(e.displayName).toBe("SQ *THE CORNER 99");
    expect(e.domain).toBeUndefined();
  });
});

describe("bankProvider (mock) lifecycle", () => {
  it("seeds a connection, connects, syncs and unlinks", async () => {
    const p = bankProvider();
    expect(p.mode).toBe("mock");

    const seeded = await p.listConnections();
    expect(seeded.length).toBeGreaterThanOrEqual(1);

    const added = await p.connect("Chase");
    expect(added.institution).toBe("Chase");
    expect((await p.listConnections()).some((c) => c.id === added.id)).toBe(true);

    const result = await p.sync(added.id);
    expect(result.syncedAt).toBeTruthy();
    const after = (await p.listConnections()).find((c) => c.id === added.id);
    expect(after!.lastSyncedAt).toBe(result.syncedAt);

    await p.unlink(added.id);
    expect((await p.listConnections()).some((c) => c.id === added.id)).toBe(false);
  });
});
