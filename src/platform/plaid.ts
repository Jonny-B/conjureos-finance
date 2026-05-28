// Thin client for the Plaid edge functions hosted on the shared ConjureOS
// Supabase project. Three endpoints, three calls; the heavy lifting (Plaid
// API auth, Vault writes, transaction ingest) lives in the edge functions.
//
// Endpoints (ConjureOS/supabase/functions):
//   POST {base}/plaid-link-token  {}                  -> { link_token, expiration }
//   POST {base}/plaid-exchange    { public_token, institution? } -> { item_id }
//   POST {base}/plaid-sync        { item_id }         -> { added, modified, removed, accounts }
//
// Auth: the caller's Supabase JWT (Bearer) plus the project's anon key
// (apikey) — same pattern the existing HttpSyncTransport already uses.

import { getHostAccessToken } from "./host";

const FUNCTIONS_BASE_URL =
  (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined) ??
  (import.meta.env.VITE_SYNC_BASE_URL as string | undefined) ??
  "";
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

export class PlaidError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "PlaidError";
  }
}

export interface PlaidInstitution {
  institution_id: string;
  name: string;
}

export interface PlaidExchangeResult {
  item_id: string;
  reused?: boolean;
}

export interface PlaidSyncResult {
  added: number;
  modified: number;
  removed: number;
  accounts: number;
  pages: number;
  fully_synced: boolean;
}

export function isPlaidConfigured(): boolean {
  return Boolean(FUNCTIONS_BASE_URL && ANON_KEY);
}

async function call<T>(path: string, body: unknown): Promise<T> {
  if (!FUNCTIONS_BASE_URL || !ANON_KEY) {
    throw new PlaidError(
      "Plaid is not configured (VITE_SUPABASE_FUNCTIONS_URL / VITE_SUPABASE_ANON_KEY missing).",
      "client_not_configured",
      0,
    );
  }
  const token = await getHostAccessToken();
  if (!token) {
    throw new PlaidError("Sign in to ConjureOS to link a bank.", "not_signed_in", 401);
  }
  const base = FUNCTIONS_BASE_URL.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: ANON_KEY,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (e) {
    throw new PlaidError("Network error contacting Plaid edge function.", "network", 0, e);
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = typeof payload?.error === "string" ? payload.error : `http_${res.status}`;
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : code === "plaid_not_configured"
          ? "Plaid is not configured on the server yet (PLAID_CLIENT_ID / PLAID_SECRET)."
          : `Plaid request failed (${res.status})`;
    throw new PlaidError(message, code, res.status, payload);
  }
  return payload as T;
}

export function createLinkToken(): Promise<{ link_token: string; expiration: string }> {
  return call<{ link_token: string; expiration: string }>("plaid-link-token", {});
}

export function exchangePublicToken(
  publicToken: string,
  institution?: PlaidInstitution,
): Promise<PlaidExchangeResult> {
  return call<PlaidExchangeResult>("plaid-exchange", {
    public_token: publicToken,
    institution,
  });
}

export function syncItem(itemId: string): Promise<PlaidSyncResult> {
  return call<PlaidSyncResult>("plaid-sync", { item_id: itemId });
}

export interface PlaidLinkedItem {
  id: string;
  plaid_item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export async function listLinkedItems(): Promise<PlaidLinkedItem[]> {
  const { items } = await call<{ items: PlaidLinkedItem[] }>("plaid-list-items", {});
  return items;
}

export function unlinkItem(itemId: string): Promise<{ ok: true }> {
  return call<{ ok: true }>("plaid-unlink", { item_id: itemId });
}
