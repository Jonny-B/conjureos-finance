// SyncTransport backed by the conjureos-finance-backend Supabase edge functions.
//
// Endpoints (see backend repo):
//   POST {base}/sync-pull   { cursor, kinds }      -> PullResult
//   POST {base}/sync-push   { items }              -> EncryptedRecord[]
//
// Auth: a Supabase user access token (JWT) is sent as a Bearer token; the anon
// key is sent via apikey so the edge function gateway accepts the request. RLS
// on the server scopes every row to the authenticated user.

import { FinanceApiError } from "../contract";
import type { EncryptedRecord, PullResult, PushItem, RecordKind, SyncTransport } from "./transport";

export interface HttpTransportConfig {
  baseUrl: string;
  anonKey: string;
  /** Returns the current Supabase user JWT, or null if signed out. */
  getAccessToken: () => string | null;
}

export class HttpSyncTransport implements SyncTransport {
  constructor(private cfg: HttpTransportConfig) {}

  private async call<T>(path: string, body: unknown): Promise<T> {
    const token = this.cfg.getAccessToken();
    if (!token) throw new FinanceApiError("not signed in", "unauthorized");

    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: this.cfg.anonKey,
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new FinanceApiError("network error", "network", e);
    }
    if (res.status === 401 || res.status === 403) {
      throw new FinanceApiError("unauthorized", "unauthorized");
    }
    if (!res.ok) {
      throw new FinanceApiError(`sync ${path} failed (${res.status})`, "unknown");
    }
    return (await res.json()) as T;
  }

  pull(cursor: string | null, kinds?: RecordKind[]): Promise<PullResult> {
    return this.call<PullResult>("sync-pull", { cursor, kinds });
  }

  push(items: PushItem[]): Promise<EncryptedRecord[]> {
    return this.call<EncryptedRecord[]>("sync-push", { items });
  }
}
