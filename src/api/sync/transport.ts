// The wire contract between the app and conjureos-finance-backend.
//
// This is deliberately tiny and domain-blind: the server is an encrypted
// key/value sync store. It never learns what a "transaction" or "budget" is.
// It stores, per user:
//
//   (kind, id) -> { ciphertext, iv, version, updatedAt, deleted }
//
// `kind` and `id` are opaque strings chosen by the client. `ciphertext` is an
// AES-GCM blob the server cannot read. This is how we satisfy "I don't want to
// store user transactions" and "encrypted so I can't see any data server-side":
// the only clear-text the server ever holds is opaque ids and timestamps.

export type RecordKind =
  | "transaction"
  | "category"
  | "budget"
  | "account"
  | "manual_asset"
  | "savings_goal"
  | "meta";

export interface EncryptedRecord {
  kind: RecordKind;
  /** opaque, client-chosen id (e.g. the transaction id) */
  id: string;
  /** base64 AES-GCM ciphertext; null when deleted = true */
  ciphertext: string | null;
  /** base64 12-byte IV used for this record */
  iv: string | null;
  /** monotonic per-record version for last-writer-wins conflict handling */
  version: number;
  /** server-assigned; clients use it as a pull cursor */
  updatedAt: string;
  /** tombstone */
  deleted: boolean;
}

export interface PullResult {
  records: EncryptedRecord[];
  /** pass back on the next pull to get only changes since this point */
  cursor: string;
  hasMore: boolean;
}

export interface PushItem {
  kind: RecordKind;
  id: string;
  ciphertext: string | null;
  iv: string | null;
  version: number;
  deleted: boolean;
}

/**
 * Transport implemented by:
 *   - HttpSyncTransport  -> Supabase edge functions (production)
 *   - MockSyncTransport   -> in-memory (lets the crypto/sync path be tested offline)
 */
export interface SyncTransport {
  /** Incremental pull. `cursor` is null on first sync. */
  pull(cursor: string | null, kinds?: RecordKind[]): Promise<PullResult>;
  /** Idempotent upsert. Returns the server-authoritative versions/timestamps. */
  push(items: PushItem[]): Promise<EncryptedRecord[]>;
}
