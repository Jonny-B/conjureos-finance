import { useEffect, useState } from "react";
import { useFinance } from "../store/FinanceContext";
import { getTierContext, setTierContext, type InferenceBudget } from "../orchestrator";
import { useHostUser } from "../platform/useHostUser";
import { BankConnections } from "./BankConnections";

const API_MODE = (import.meta.env.VITE_FINANCE_API as string) || "mock";
const INFERENCE_MODE = (import.meta.env.VITE_INFERENCE_PROVIDER as string) || "heuristic";

export function Settings() {
  const { orchestrator } = useFinance();
  const { user, hasBridge, loading: userLoading } = useHostUser();
  const [budget, setBudget] = useState<InferenceBudget | null>(null);
  const [byk, setByk] = useState(getTierContext().userApiKey ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    orchestrator.budget().then(setBudget).catch(() => setBudget(null));
  }, [orchestrator]);

  function saveKey() {
    setTierContext({ userApiKey: byk.trim() || null });
    orchestrator.budget().then(setBudget).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">How your data flows and who can read it</div>
        </div>
      </div>

      <div className="cui-card" style={{ marginBottom: 16 }}>
        <div className="card-title">Account</div>
        <div className="row" style={{ gap: 14 }}>
          <span className={`avatar${user ? " on" : ""}`} style={{ width: 44, height: 44, fontSize: 18 }}>
            {userLoading ? "…" : user ? (user.email?.[0]?.toUpperCase() ?? "U") : "👤"}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {userLoading
                ? "Checking session…"
                : user
                  ? (user.email ?? "Signed in")
                  : hasBridge
                    ? "Signed out"
                    : "Running standalone"}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {user
                ? "Signed in via ConjureOS single sign-on"
                : hasBridge
                  ? "Sign in to ConjureOS to sync across devices"
                  : "No ConjureOS host detected — using local mock data"}
            </div>
          </div>
        </div>
        {user && (
          <div style={{ marginTop: 14 }}>
            <Line label="Email" value={user.email ?? "—"} />
            <Line label="User ID" value={`${user.id.slice(0, 8)}…${user.id.slice(-4)}`} />
            <Line label="Identity source" value="ConjureOS SSO (default-app bridge)" />
          </div>
        )}
        {!user && (
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            As a ConjureOS default app, Conjure Finance reuses your OS session — it never asks for a
            second login. Your encryption key is still derived locally and never shared with the host.
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <BankConnections />
      </div>

      <div className="grid grid-2">
        <div className="cui-card">
          <div className="card-title">Privacy & data</div>
          <Line label="Data source" value={API_MODE === "synced" ? "Encrypted sync (Supabase)" : "Local mock (no backend)"} />
          <Line
            label="Encryption"
            value={API_MODE === "synced" ? "End-to-end (AES-GCM, key never leaves device)" : "n/a — data is in-memory only"}
          />
          <Line label="What the server stores" value="Opaque ids + ciphertext only" />
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            Transactions are encrypted in your browser before sync. The backend keeps only opaque
            ids and ciphertext it cannot read — no merchant, amount, or category ever reaches the
            server in the clear.
          </p>
        </div>

        <div className="cui-card">
          <div className="card-title">Categorization orchestrator</div>
          <Line label="Mode" value={INFERENCE_MODE === "anthropic" ? "AI (Anthropic) + rules" : "Rules / heuristic"} />
          <Line
            label="Active engine"
            value={budget ? engineLabel(budget) : "…"}
          />
          {budget?.remaining != null && (
            <Line label="Requests remaining" value={String(budget.remaining)} />
          )}
          <p className="muted" style={{ fontSize: 13, margin: "10px 0" }}>
            Categorization runs on your device. The engine is resolved tier&nbsp;credits →
            group&nbsp;key → your&nbsp;own&nbsp;key, and falls back to offline rules when none are
            available — so it always works.
          </p>

          {INFERENCE_MODE === "anthropic" && (
            <div className="field" style={{ marginTop: 8 }}>
              <label>Your Anthropic key (BYK fallback)</label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="cui-input"
                  type="password"
                  placeholder="sk-ant-…"
                  value={byk}
                  onChange={(e) => setByk(e.target.value)}
                />
                <button className="cui-button cui-button--primary" onClick={saveKey}>{saved ? "Saved" : "Save"}</button>
              </div>
              <span className="faint" style={{ fontSize: 12 }}>
                Stored in memory for this session only.
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function engineLabel(b: InferenceBudget): string {
  switch (b.source) {
    case "tier":
      return "Tier-funded AI";
    case "group":
      return "Group-key AI";
    case "byk":
      return "Your-key AI";
    default:
      return "Offline rules";
  }
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="row between" style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="muted">{label}</span>
      <span style={{ textAlign: "right" }}>{value}</span>
    </div>
  );
}
