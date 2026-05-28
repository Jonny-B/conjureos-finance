// Plaid Link launcher. Two-call dance per link attempt:
//   1. plaid-link-token mints a short-lived Link token scoped to this user.
//   2. user clicks "Link a bank" -> Plaid Link modal opens (handled by
//      react-plaid-link's usePlaidLink hook).
//   3. On success Plaid Link returns a public_token + institution metadata;
//      we call plaid-exchange (server stashes the access_token in Vault and
//      creates the finance.plaid_items row), then plaid-sync (server pulls
//      accounts + first page of transactions).
//
// All progress and errors are surfaced inline; the parent decides what to
// do after a successful sync (typically: refresh the connected-items list).

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import {
  createLinkToken,
  exchangePublicToken,
  isPlaidConfigured,
  PlaidError,
  syncItem,
  type PlaidSyncResult,
} from "../platform/plaid";

type Phase =
  | "loading_token"
  | "ready"
  | "opening"
  | "exchanging"
  | "syncing"
  | "done"
  | "error";

export interface PlaidLinkButtonProps {
  /** Fired once sync completes; parent reloads accounts. */
  onLinked?: (result: { item_id: string; sync: PlaidSyncResult }) => void;
  /** Override the default button label. */
  label?: string;
  /** Compact variant: smaller padding for inline use. */
  compact?: boolean;
}

export function PlaidLinkButton({ onLinked, label, compact }: PlaidLinkButtonProps) {
  const [phase, setPhase] = useState<Phase>("loading_token");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PlaidSyncResult | null>(null);
  const configured = useMemo(() => isPlaidConfigured(), []);

  useEffect(() => {
    if (!configured) {
      setPhase("error");
      setError("Plaid client config missing (VITE_SUPABASE_FUNCTIONS_URL).");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { link_token } = await createLinkToken();
        if (!cancelled) {
          setLinkToken(link_token);
          setPhase("ready");
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof PlaidError ? e.message : "Failed to fetch link token");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setError(null);
      setPhase("exchanging");
      try {
        const inst = metadata.institution
          ? { institution_id: metadata.institution.institution_id, name: metadata.institution.name }
          : undefined;
        const { item_id } = await exchangePublicToken(publicToken, inst);
        setPhase("syncing");
        const sync = await syncItem(item_id);
        setLastResult(sync);
        setPhase("done");
        onLinked?.({ item_id, sync });
      } catch (e) {
        const msg = e instanceof PlaidError ? e.message : "Link failed";
        setError(msg);
        setPhase("error");
      }
    },
    [onLinked],
  );

  const onExit = useCallback(() => {
    // User dismissed the modal without finishing. Reset to ready so they
    // can retry without re-fetching a link token (the token is still valid
    // for ~30 min — see plaid-link-token.ts).
    setPhase((p) => (p === "opening" ? "ready" : p));
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  const click = () => {
    if (phase === "ready" && ready) {
      setPhase("opening");
      open();
    }
  };

  const buttonLabel =
    label ??
    (phase === "loading_token"
      ? "Preparing…"
      : phase === "ready"
        ? "Link a bank"
        : phase === "opening"
          ? "Opening…"
          : phase === "exchanging"
            ? "Connecting…"
            : phase === "syncing"
              ? "Importing transactions…"
              : phase === "done"
                ? "Link another bank"
                : "Try again");

  const disabled =
    !configured ||
    phase === "loading_token" ||
    phase === "opening" ||
    phase === "exchanging" ||
    phase === "syncing" ||
    (phase === "ready" && !ready);

  const onErrorRetry = () => {
    setError(null);
    setPhase("loading_token");
    // Re-trigger the link-token fetch by toggling configured-dep effect.
    setLinkToken(null);
    (async () => {
      try {
        const { link_token } = await createLinkToken();
        setLinkToken(link_token);
        setPhase("ready");
      } catch (e) {
        setError(e instanceof PlaidError ? e.message : "Failed to fetch link token");
        setPhase("error");
      }
    })();
  };

  return (
    <div>
      <button
        type="button"
        className={`cui-button cui-button--primary${compact ? " cui-button--sm" : ""}`}
        onClick={phase === "error" ? onErrorRetry : click}
        disabled={disabled}
      >
        {buttonLabel}
      </button>
      {error && (
        <div className="muted" style={{ fontSize: 13, marginTop: 8, color: "var(--danger, #c33)" }}>
          {error}
        </div>
      )}
      {phase === "done" && lastResult && (
        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Imported {lastResult.accounts} account{lastResult.accounts === 1 ? "" : "s"} and{" "}
          {lastResult.added} transaction{lastResult.added === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}
