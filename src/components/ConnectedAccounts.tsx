// Settings card that surfaces linked Plaid items + a button to link a new
// bank + per-item unlink. Pulls the list from the plaid-list-items edge
// function (so the keystone app doesn't need the `finance` schema exposed
// to PostgREST just to render this card).
//
// Behavior:
//   - On mount, fetches the items. While loading, shows a "Checking…" line.
//   - "Link a bank" button is always visible at the bottom.
//   - After a successful link, the list re-fetches so the new item appears.

import { useCallback, useEffect, useState } from "react";
import {
  listLinkedItems,
  PlaidError,
  unlinkItem,
  type PlaidLinkedItem,
  type PlaidSyncResult,
} from "../platform/plaid";
import { PlaidLinkButton } from "./PlaidLinkButton";

interface ConnectedAccountsProps {
  signedIn: boolean;
}

export function ConnectedAccounts({ signedIn }: ConnectedAccountsProps) {
  const [items, setItems] = useState<PlaidLinkedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingUnlinkId, setPendingUnlinkId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<PlaidSyncResult | null>(null);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setItems([]);
      return;
    }
    setError(null);
    try {
      const fresh = await listLinkedItems();
      setItems(fresh);
    } catch (e) {
      // not_signed_in here means the SSO bridge wasn't ready yet; show a
      // softer message rather than a scary error.
      if (e instanceof PlaidError && e.code === "not_signed_in") {
        setItems([]);
      } else if (e instanceof PlaidError && e.code === "plaid_not_configured") {
        setError("Plaid isn't configured on the server yet (PLAID_CLIENT_ID).");
        setItems([]);
      } else {
        setError(e instanceof Error ? e.message : "Failed to load connected banks.");
      }
    }
  }, [signedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onUnlink = async (item: PlaidLinkedItem) => {
    if (!confirm(`Disconnect ${item.institution_name ?? "this bank"}? Transactions imported from it will be removed.`)) {
      return;
    }
    setPendingUnlinkId(item.id);
    setError(null);
    try {
      await unlinkItem(item.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setPendingUnlinkId(null);
    }
  };

  const onLinked = async (result: { item_id: string; sync: PlaidSyncResult }) => {
    setLastSync(result.sync);
    await refresh();
  };

  return (
    <div className="cui-card" style={{ marginBottom: 16 }}>
      <div className="card-title">Connected banks</div>
      {!signedIn && (
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
          Sign in to ConjureOS to link a bank account via Plaid.
        </p>
      )}
      {signedIn && items === null && (
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>Checking…</p>
      )}
      {signedIn && items?.length === 0 && (
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
          No banks linked yet. Connecting one imports your accounts and recent
          transactions.
        </p>
      )}
      {signedIn && items && items.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {items.map((item) => (
            <div
              key={item.id}
              className="row between"
              style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {item.institution_name ?? "Unnamed institution"}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Linked {fmtRelative(item.created_at)}
                  {item.last_synced_at ? ` · last synced ${fmtRelative(item.last_synced_at)}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="cui-button cui-button--sm"
                onClick={() => onUnlink(item)}
                disabled={pendingUnlinkId === item.id}
              >
                {pendingUnlinkId === item.id ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--danger, #c33)" }}>{error}</div>
      )}
      {lastSync && (
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Last import: {lastSync.added} added, {lastSync.modified} modified, {lastSync.removed} removed.
        </div>
      )}
      {signedIn && (
        <div style={{ marginTop: 14 }}>
          <PlaidLinkButton onLinked={onLinked} />
        </div>
      )}
    </div>
  );
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const delta = Date.now() - then;
  const min = Math.floor(delta / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
