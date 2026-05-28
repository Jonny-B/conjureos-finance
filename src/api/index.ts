// Factory that selects the FinanceApi implementation. This is the ONLY place in
// the app that decides mock vs real, which is what lets a contributor run and
// improve the entire app with zero backend access (VITE_FINANCE_API=mock).

import type { FinanceApi } from "./contract";
import { MockFinanceApi } from "./mock/mockApi";
import { SyncedFinanceApi } from "./synced/syncedApi";
import { RestFinanceApi } from "./rest/restApi";
import { HttpSyncTransport } from "./sync/httpTransport";
import { Vault } from "../crypto/vault";
import { getHostAccessToken } from "../platform/host";

export type { FinanceApi } from "./contract";
export { FinanceApiError } from "./contract";
export * from "./types";

export type ApiMode = "mock" | "synced" | "rest";

export interface BuildApiOptions {
  mode?: ApiMode;
  vault?: Vault;
  /** returns the Supabase user JWT (only needed for synced + rest modes) */
  getAccessToken?: () => string | null | Promise<string | null>;
}

/** Singleton vault shared across the app session. */
export const vault = new Vault();

export function buildFinanceApi(opts: BuildApiOptions = {}): FinanceApi {
  const mode = opts.mode ?? ((import.meta.env.VITE_FINANCE_API as ApiMode) || "mock");
  if (mode === "rest") {
    // PostgREST against the shared ConjureOS Supabase project. Reads Plaid-fed
    // accounts/transactions; writes column-scoped mutations on transactions +
    // budgets. Requires the `finance` schema to be added to "Exposed schemas"
    // on the Supabase dashboard. See src/api/rest/restApi.ts for the header
    // convention (Accept-Profile / Content-Profile).
    const baseUrl =
      (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
      stripFunctionsPath(import.meta.env.VITE_SYNC_BASE_URL as string | undefined);
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    if (!baseUrl || !anonKey) {
      console.warn("[finance api] VITE_SUPABASE_URL or anon key missing; falling back to mock.");
      return new MockFinanceApi();
    }
    return new RestFinanceApi({
      baseUrl,
      anonKey,
      getAccessToken: opts.getAccessToken ?? getHostAccessToken,
    });
  }
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

/** Best-effort: turn a `.../functions/v1` URL into the project root. */
function stripFunctionsPath(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/functions\/v1\/?$/, "").replace(/\/$/, "");
}
