// Net worth from linked accounts: assets minus liabilities. Credit/loan
// balances are stored negative (a debt), so the net is simply the sum of every
// balance. (Manual assets like a home or car will slot in here once there's a
// store to persist them — a follow-up that needs a new encrypted record kind.)

import type { Account } from "../api/types";

export interface NetWorthRow {
  accountId: string;
  name: string;
  institution: string;
  type: Account["type"];
  balanceCents: number;
  isAsset: boolean;
}

export interface NetWorthBreakdown {
  assetsCents: number;
  liabilitiesCents: number;
  netCents: number;
  rows: NetWorthRow[];
}

const LIABILITY_TYPES = new Set<Account["type"]>(["credit", "loan"]);

export function computeNetWorth(accounts: Account[]): NetWorthBreakdown {
  let assetsCents = 0;
  let liabilitiesCents = 0;
  const rows: NetWorthRow[] = [];

  for (const a of accounts) {
    const isAsset = !LIABILITY_TYPES.has(a.type);
    rows.push({
      accountId: a.id,
      name: a.name,
      institution: a.institution,
      type: a.type,
      balanceCents: a.balanceCents,
      isAsset,
    });
    if (isAsset) assetsCents += a.balanceCents;
    else liabilitiesCents += Math.abs(a.balanceCents);
  }

  return { assetsCents, liabilitiesCents, netCents: assetsCents - liabilitiesCents, rows };
}
