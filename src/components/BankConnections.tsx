import { useEffect, useState } from "react";
import { bankProvider, type BankConnection } from "../sync/bankProvider";
import { formatDateTime } from "../lib/format";

// Bank connection management. Mock-backed today (one simulated institution);
// swaps to real Plaid Link via the BankProvider seam when Plaid prod is on.
export function BankConnections() {
  const provider = bankProvider();
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [name, setName] = useState("");

  const load = () => provider.listConnections().then(setConnections);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncAll() {
    setSyncing(true);
    try {
      await provider.sync();
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function connect() {
    if (!name.trim()) return;
    await provider.connect(name);
    setName("");
    setConnecting(false);
    await load();
  }

  async function unlink(id: string) {
    await provider.unlink(id);
    await load();
  }

  return (
    <div className="cui-card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>Bank connections</div>
        <button className="cui-button cui-button--ghost btn-sm" onClick={syncAll} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {provider.mode === "mock" && (
        <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>
          Demo mode — connections are simulated. Live bank linking turns on with Plaid.
        </div>
      )}

      <div className="grid" style={{ gap: 2 }}>
        {connections.map((c) => (
          <div key={c.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <strong>{c.institution}</strong>
                <span className={`cui-pill ${c.status === "healthy" ? "cui-pill--success" : "cui-pill--warn"}`}>
                  {c.status === "healthy" ? "Healthy" : "Needs attention"}
                </span>
              </div>
              <div className="faint" style={{ fontSize: 12 }}>
                {c.accountMasks.length > 0 ? `${c.accountMasks.length} account${c.accountMasks.length === 1 ? "" : "s"} · ` : ""}
                {c.lastSyncedAt ? `synced ${formatDateTime(c.lastSyncedAt)}` : "not synced"}
              </div>
            </div>
            <button className="cui-button cui-button--ghost btn-sm" onClick={() => unlink(c.id)}>Unlink</button>
          </div>
        ))}
        {connections.length === 0 && <div className="muted">No banks connected.</div>}
      </div>

      {connecting ? (
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <input className="cui-input" placeholder="Institution name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="cui-button cui-button--primary btn-sm" onClick={connect}>Connect</button>
          <button className="cui-button cui-button--ghost btn-sm" onClick={() => setConnecting(false)}>Cancel</button>
        </div>
      ) : (
        <button className="cui-button cui-button--ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setConnecting(true)}>
          + Connect a bank
        </button>
      )}
    </div>
  );
}
