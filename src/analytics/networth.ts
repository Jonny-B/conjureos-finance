// Net worth: assets minus liabilities, across linked accounts AND user-entered
// manual assets (home, car, mortgage). Credit/loan balances are stored negative
// (a debt) and manual "debt" assets are owed amounts, so both subtract.

import type { Account, ManualAsset } from "../api/types";

export interface NetWorthRow {
  /** account id or manual-asset id */
  id: string;
  name: string;
  /** institution for accounts, or the manual-asset kind label */
  detail: string;
  /** signed contribution to net worth (negative = liability) */
  amountCents: number;
  isAsset: boolean;
  source: "account" | "manual";
}

export interface NetWorthBreakdown {
  assetsCents: number;
  liabilitiesCents: number;
  netCents: number;
  rows: NetWorthRow[];
}

const LIABILITY_TYPES = new Set<Account["type"]>(["credit", "loan"]);

const MANUAL_KIND_LABEL: Record<ManualAsset["kind"], string> = {
  property: "Property",
  vehicle: "Vehicle",
  cash: "Cash",
  investment: "Investment",
  other: "Other asset",
  debt: "Debt",
};

export function computeNetWorth(accounts: Account[], manualAssets: ManualAsset[] = []): NetWorthBreakdown {
  let assetsCents = 0;
  let liabilitiesCents = 0;
  const rows: NetWorthRow[] = [];

  for (const a of accounts) {
    const isAsset = !LIABILITY_TYPES.has(a.type);
    rows.push({
      id: a.id,
      name: a.name,
      detail: a.institution,
      amountCents: a.balanceCents,
      isAsset,
      source: "account",
    });
    if (isAsset) assetsCents += a.balanceCents;
    else liabilitiesCents += Math.abs(a.balanceCents);
  }

  for (const m of manualAssets) {
    const isAsset = m.kind !== "debt";
    rows.push({
      id: m.id,
      name: m.name,
      detail: MANUAL_KIND_LABEL[m.kind],
      amountCents: isAsset ? m.valueCents : -Math.abs(m.valueCents),
      isAsset,
      source: "manual",
    });
    if (isAsset) assetsCents += m.valueCents;
    else liabilitiesCents += Math.abs(m.valueCents);
  }

  return { assetsCents, liabilitiesCents, netCents: assetsCents - liabilitiesCents, rows };
}
