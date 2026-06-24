import { useState } from "react";
import { useFinance } from "../store/FinanceContext";
import type { Account, ManualAssetKind } from "../api/types";
import { computeNetWorth } from "../analytics/networth";
import { formatCurrency, formatDate } from "../lib/format";

const ASSET_KINDS: { value: ManualAssetKind; label: string }[] = [
  { value: "property", label: "🏠 Property" },
  { value: "vehicle", label: "🚗 Vehicle" },
  { value: "investment", label: "📈 Investment" },
  { value: "cash", label: "💵 Cash" },
  { value: "other", label: "📦 Other asset" },
  { value: "debt", label: "💳 Debt / loan" },
];

export function NetWorth() {
  const { api, accounts, manualAssets, refresh } = useFinance();
  const nw = computeNetWorth(accounts, manualAssets);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ManualAssetKind>("property");
  const [value, setValue] = useState("");

  const assetAccounts = accounts.filter((a) => a.type !== "credit" && a.type !== "loan");
  const debtAccounts = accounts.filter((a) => a.type === "credit" || a.type === "loan");
  const manualAssetsOnly = manualAssets.filter((m) => m.kind !== "debt");
  const manualDebts = manualAssets.filter((m) => m.kind === "debt");

  async function addAsset() {
    const cents = Math.round(parseFloat(value) * 100);
    if (!name.trim() || !Number.isFinite(cents) || cents <= 0) return;
    await api.upsertManualAsset({ name: name.trim(), kind, valueCents: cents });
    setName("");
    setValue("");
    setAdding(false);
    refresh();
  }

  async function removeAsset(id: string) {
    await api.deleteManualAsset(id);
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Net worth</div>
          <div className="page-sub">Everything you own, minus everything you owe</div>
        </div>
        <button className="cui-button cui-button--primary" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add asset or debt"}
        </button>
      </div>

      <div className="cui-card" style={{ marginBottom: 16 }}>
        <div className="row between wrap" style={{ gap: 16 }}>
          <div>
            <div className="stat-label">Net worth</div>
            <div className={`stat ${nw.netCents >= 0 ? "pos" : "neg"}`} style={{ fontSize: 34 }}>
              {formatCurrency(nw.netCents)}
            </div>
          </div>
          <div className="row" style={{ gap: 28 }}>
            <div>
              <div className="stat-label">Assets</div>
              <div className="stat pos" style={{ fontSize: 20 }}>{formatCurrency(nw.assetsCents)}</div>
            </div>
            <div>
              <div className="stat-label">Debts</div>
              <div className="stat neg" style={{ fontSize: 20 }}>{formatCurrency(nw.liabilitiesCents)}</div>
            </div>
          </div>
        </div>
      </div>

      {adding && (
        <div className="cui-card" style={{ marginBottom: 16 }}>
          <div className="row wrap" style={{ gap: 12, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Name</label>
              <input className="cui-input" value={name} placeholder="e.g. Home, 401(k), Car loan" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field" style={{ width: 170 }}>
              <label>Type</label>
              <select className="cui-input" value={kind} onChange={(e) => setKind(e.target.value as ManualAssetKind)}>
                {ASSET_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 150 }}>
              <label>Value ($)</label>
              <input className="cui-input" type="number" min="0" step="100" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <button className="cui-button cui-button--primary" onClick={addAsset}>Save</button>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="cui-card">
          <div className="card-title">💰 Assets</div>
          <div className="grid" style={{ gap: 2 }}>
            {assetAccounts.map((a) => (
              <Row key={a.id} name={a.name} detail={`${a.institution} ····${a.mask}`} amountCents={a.balanceCents} />
            ))}
            {manualAssetsOnly.map((m) => (
              <Row key={m.id} name={m.name} detail="Manual" amountCents={m.valueCents} onRemove={() => removeAsset(m.id)} />
            ))}
            {assetAccounts.length === 0 && manualAssetsOnly.length === 0 && <div className="muted">No assets yet.</div>}
          </div>
        </div>

        <div className="cui-card">
          <div className="card-title">💳 Debts</div>
          <div className="grid" style={{ gap: 2 }}>
            {debtAccounts.map((a) => (
              <DebtRow key={a.id} account={a} />
            ))}
            {manualDebts.map((m) => (
              <Row key={m.id} name={m.name} detail="Manual" amountCents={-Math.abs(m.valueCents)} onRemove={() => removeAsset(m.id)} />
            ))}
            {debtAccounts.length === 0 && manualDebts.length === 0 && <div className="muted">No debts. Nice.</div>}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({
  name,
  detail,
  amountCents,
  onRemove,
}: {
  name: string;
  detail: string;
  amountCents: number;
  onRemove?: () => void;
}) {
  return (
    <div className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{name}</div>
        <div className="faint" style={{ fontSize: 12 }}>{detail}</div>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <span className={`amount ${amountCents < 0 ? "neg" : ""}`}>{formatCurrency(amountCents)}</span>
        {onRemove && (
          <button className="cui-button cui-button--ghost btn-sm" onClick={onRemove}>Remove</button>
        )}
      </div>
    </div>
  );
}

function DebtRow({ account }: { account: Account }) {
  const l = account.liability;
  return (
    <div className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{account.name}</div>
        <div className="faint" style={{ fontSize: 12 }}>
          {l?.aprPct != null && <>{l.aprPct}% APR</>}
          {l?.minPaymentCents != null && <> · min {formatCurrency(l.minPaymentCents)}</>}
          {l?.nextPaymentDate && <> · due {formatDate(l.nextPaymentDate)}</>}
          {!l && `${account.institution} ····${account.mask}`}
        </div>
      </div>
      <span className="amount neg">{formatCurrency(account.balanceCents)}</span>
    </div>
  );
}
