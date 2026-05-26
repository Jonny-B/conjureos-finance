// In-memory SyncTransport. Lets the full encrypted sync path (crypto + materialize)
// be exercised in dev and tests without standing up Supabase.

import type { EncryptedRecord, PullResult, PushItem, RecordKind, SyncTransport } from "./transport";

export class MockSyncTransport implements SyncTransport {
  private rows = new Map<string, EncryptedRecord>();
  private clock = 0;

  private key(kind: RecordKind, id: string) {
    return `${kind}:${id}`;
  }

  async pull(cursor: string | null, kinds?: RecordKind[]): Promise<PullResult> {
    const since = cursor ?? "";
    let records = [...this.rows.values()].filter((r) => r.updatedAt > since);
    if (kinds?.length) {
      const set = new Set(kinds);
      records = records.filter((r) => set.has(r.kind));
    }
    records.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
    const cursorOut = records.length ? records[records.length - 1].updatedAt : since;
    return { records, cursor: cursorOut, hasMore: false };
  }

  async push(items: PushItem[]): Promise<EncryptedRecord[]> {
    const out: EncryptedRecord[] = [];
    for (const item of items) {
      const updatedAt = this.tick();
      const rec: EncryptedRecord = {
        kind: item.kind,
        id: item.id,
        ciphertext: item.deleted ? null : item.ciphertext,
        iv: item.deleted ? null : item.iv,
        version: item.version,
        updatedAt,
        deleted: item.deleted,
      };
      this.rows.set(this.key(item.kind, item.id), rec);
      out.push(rec);
    }
    return out;
  }

  private tick(): string {
    this.clock += 1;
    return `${Date.now()}.${String(this.clock).padStart(6, "0")}`;
  }
}
