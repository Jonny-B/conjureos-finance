// Factory that selects the FinanceApi implementation. This is the ONLY place in
// the app that decides mock vs real, which is what lets a contributor run and
// improve the entire app with zero backend access (VITE_FINANCE_API=mock).

import type { FinanceApi } from "./contract";
import { MockFinanceApi } from "./mock/mockApi";
import { SyncedFinanceApi } from "./synced/syncedApi";
import { HttpSyncTransport } from "./sync/httpTransport";
import { Vault } from "../crypto/vault";
import { getHostAccessToken } from "../platform/host";

export type { FinanceApi } from "./contract";
export { FinanceApiError } from "./contract";
export * from "./types";

export type ApiMode = "mock" | "synced";

export interface BuildApiOptions {
  mode?: ApiMode;
  vault?: Vault;
  /** returns the Supabase user JWT (only needed for synced mode) */
  getAccessToken?: () => string | null;
}

/** Singleton vault shared across the app session. */
export const vault = new Vault();

export function buildFinanceApi(opts: BuildApiOptions = {}): FinanceApi {
  const mode = opts.mode ?? ((import.meta.env.VITE_FINANCE_API as ApiMode) || "mock");
  if (mode === "synced") {
    const baseUrl = import.meta.env.VITE_SYNC_BASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const transport = new HttpSyncTransport({
      baseUrl,
      anonKey,
      // Default to ConjureOS SSO: reuse the host's signed-in session token.
      getAccessToken: opts.getAccessToken ?? getHostAccessToken,
    });
    return new SyncedFinanceApi(transport, opts.vault ?? vault);
  }
  return new MockFinanceApi();
}
