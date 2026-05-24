# Conjure Finance — Design

> Mint / Rocket Money-style personal finance app. A **keystone app** for
> ConjureOS: open-source frontend, private backend, runs sandboxed inside
> ConjureOS, talks to Plaid + Supabase through a kernel bridge.
>
> This is the architecture doc. Read it before building. Companion docs:
> `ConjureOS/PHASE_FINANCE_DESIGN.md` (the platform-side bridge work) and
> the private `conjureos-finance-backend` repo (edge functions + schema).

## What we're building

A budgeting + net-worth app in the lineage of Mint (account aggregation,
spend categorization, budgets) and Rocket Money (subscription/recurring
detection, bill timeline). Bank data comes from **Plaid**. It runs as a
ConjureOS keystone app — imported like any anchor app, but trusted enough
to reach a real backend.

Core surfaces (v1):
- **Accounts + net worth** — linked balances, assets vs liabilities, trend.
- **Transactions** — list, search, filter, recategorize, split.
- **Budgets** — per-category monthly budgets with progress.
- **Recurring / subscriptions** — detected recurring charges + a bill timeline.

## The three repos

This product spans three repos by design — the open/closed split is the
whole point.

| Repo | Visibility | Holds |
|---|---|---|
| `conjureos-finance` (this) | **open** | React app, `core/` logic, `FinanceApi` contract, `MockFinanceApi`, the bridge-backed client. **No secrets, no Plaid code, no SQL.** |
| `conjureos-finance-backend` | **private** | Supabase edge-function source (Plaid client, token exchange, sync, webhook), the `finance` schema migrations, secret wiring. |
| `ConjureOS` | open (platform) | The keystone finance bridge + `finance.access` permission that lets this app reach the backend. See `PHASE_FINANCE_DESIGN.md`. |

A contributor only ever needs this open repo. They never see the backend
and never need credentials — the mock layer covers them (see below).

## Supabase: one project, isolated schema

Decision: **reuse the existing ConjureOS project** (`ntgelbtepecqsqloxmct`),
not a second project. One auth, one billing, the user is already signed in.

Isolation comes from a dedicated **`finance` Postgres schema** (not
`public`), so finance tables never mingle with OS tables and the domain
lifts out cleanly if it ever needs its own project. Per the ConjureOS rule:
every table gets **both** RLS policies **and** table-level GRANTs.

Tables (in `finance` schema, all RLS'd to `auth.uid()`):
- `plaid_items` — one row per linked institution. Holds the Plaid
  `access_token` **encrypted**, plus `item_id`, institution, sync cursor.
  **Never readable by the anon/authenticated client** — service-role only,
  touched exclusively from edge functions.
- `accounts` — per-account balances, type, mask. Client-readable (RLS).
- `transactions` — normalized transactions, category, pending flag,
  user overrides. Client-readable (RLS).
- `budgets` — per-category monthly targets. Client read/write (RLS).
- `recurring` — detected recurring series. Client-readable (RLS).

The hard line: **Plaid access tokens and `PLAID_SECRET` never leave the
server.** The browser only ever holds the Supabase anon key, the user's
session JWT (held by the ConjureOS parent page, see bridge), and Plaid
Link's short-lived public token.

## How a sandboxed app reaches a private backend

This is the crux, and it's the first ConjureOS anchor app that needs a
backend. ConjureOS apps run in a sandboxed iframe with narrow bridges
(`__conjureos.ai.complete`, `__conjureos.report.submit`, VFS). There is
**already a precedent for exactly this shape**: the **report bridge**.
The Need Help app calls `__conjureos.report.submit`; the kernel (the
trusted parent page) attaches the user's JWT and calls the `report-issue`
edge function, which holds the GitHub PAT server-side. The app never sees
the token.

The finance bridge generalizes that one pattern:

```
finance app (sandboxed iframe)
   │  window.__conjureos.finance.<method>(params)        // no token here
   ▼
ConjureOS kernel (trusted parent, holds the Supabase session)
   │  fetch(edge fn URL, { Authorization: Bearer <JWT> }) // token added here
   ▼
finance edge functions (private)  ──►  Plaid + finance schema (service role)
```

Two consequences fall out of using the report-bridge pattern:
1. **The JWT never enters the sandbox.** The iframe can't exfiltrate a
   token it never holds. Strictly safer than handing the app a session.
2. **The app's "real" API client is thin.** It just marshals calls onto
   `window.__conjureos.finance.*`. All auth + URL knowledge lives in the
   kernel.

**Keystone-only.** The bridge is wired only for apps the kernel trusts
(`manifest.builtIn === true` / a keystone flag) that also declare the new
`finance.access` permission. Arbitrary App Store apps can declare the
permission all they like and still never get the bridge — the gate is in
the kernel, not the manifest. Detail in `PHASE_FINANCE_DESIGN.md`.

## App layering (mirrors ConjureOS)

Same discipline as ConjureOS's kernel/shell/ai/platform split and its
`CloudFileTransport` swappable-interface pattern: lower layers never know
about higher layers; the backend hides behind one typed interface.

```
src/
  core/     pure domain — types + budget/categorization/net-worth math.
            No I/O, no React, no fetch. Trivially unit-testable.
  api/      FinanceApi interface + two impls:
              MockFinanceApi    (fixtures; default with no backend)
              BridgeFinanceApi  (calls window.__conjureos.finance.*)
  state/    hooks / store over a FinanceApi instance.
  ui/       React components. Depend on state, never on api directly.
```

`core/` is where the app's actual intelligence lives (categorization
rules, recurring detection, budget rollups, net-worth series) and it's
pure, so it's covered by fast unit tests with zero mocking ceremony.

## The `FinanceApi` contract + the mock layer

One interface is the seam between app and backend. Sketch:

```ts
interface FinanceApi {
  // link
  createLinkToken(): Promise<{ linkToken: string }>;
  exchangePublicToken(publicToken: string): Promise<void>;
  // data
  listAccounts(): Promise<Account[]>;
  listTransactions(q: TxQuery): Promise<Transaction[]>;
  syncTransactions(): Promise<{ added: number; modified: number }>;
  // budgets
  getBudgets(month: string): Promise<Budget[]>;
  upsertBudget(b: BudgetInput): Promise<Budget>;
  // recurring + summary
  listRecurring(): Promise<RecurringSeries[]>;
  getNetWorth(range: DateRange): Promise<NetWorthPoint[]>;
}
```

Two implementations:
- **`MockFinanceApi`** — returns rich, realistic fixtures: a few linked
  accounts (checking/savings/credit/investment), several hundred dated
  transactions across categories, a handful of budgets, detected
  subscriptions, a net-worth series. Deterministic seed so screenshots and
  tests are stable. `createLinkToken` / `exchangePublicToken` simulate a
  successful link without Plaid.
- **`BridgeFinanceApi`** — marshals each method onto
  `window.__conjureos.finance.*`.

**Selection is automatic.** If the finance bridge is present
(`window.__conjureos?.finance`), use `BridgeFinanceApi`; otherwise use
`MockFinanceApi`. So:
- Contributor: `git clone`, `npm i`, `npm run dev` → fully populated app on
  the mock, **zero credentials, no Plaid account, no ConjureOS running**.
- Inside ConjureOS (signed in, keystone): same code, real data.

A `VITE_FINANCE_FORCE_MOCK` escape hatch lets you force the mock even
inside ConjureOS for demos.

## Plaid flow (v1: Transactions product)

Standard Plaid Link, with every secret server-side:
1. App asks for a link token → `createLinkToken` → edge fn calls Plaid with
   `PLAID_CLIENT_ID` + `PLAID_SECRET` → returns a `link_token`.
2. App opens Plaid Link with that token; user authenticates with their
   bank; Link returns a short-lived **public token** to the app.
3. App calls `exchangePublicToken(publicToken)` → edge fn exchanges it for
   an `access_token`, **encrypts + stores** it in `finance.plaid_items`.
   The access token never returns to the client.
4. `syncTransactions` → edge fn calls Plaid `/transactions/sync` with the
   stored cursor, normalizes, upserts into `finance.transactions` /
   `finance.accounts`.
5. `plaid-webhook` (no JWT; verified by Plaid signature) receives
   `SYNC_UPDATES_AVAILABLE` and refreshes server-side.

Environment ladder: Plaid **Sandbox** for all dev (fake banks, free), then
Development/Production keys when going live — set only as edge-function
secrets, never in any repo.

## Security posture (summary)

- Plaid `access_token` + `PLAID_SECRET` + service-role key: **edge-function
  env only**. Encrypted at rest; read only server-side.
- Browser/iframe holds: Supabase anon key + Plaid public token. **Never a
  service token, never an access token, never the session JWT** (that stays
  in the ConjureOS parent).
- `finance` schema: RLS scoped to `auth.uid()` on every client-readable
  table; `plaid_items` not client-readable at all. GRANTs alongside RLS.
- The bridge is keystone-gated in the kernel, not just manifest-gated.

## Build order

1. **Platform** (`ConjureOS`): keystone finance bridge + `finance.access`
   permission. Prereq for any real data. See `PHASE_FINANCE_DESIGN.md`.
2. **Open app** (this repo): scaffold + `core/` + `FinanceApi` +
   `MockFinanceApi` + all UI, built entirely against the mock. This is the
   bulk of the app and needs no backend.
3. **Private backend** (`conjureos-finance-backend`): `finance` schema
   migrations + Plaid edge functions + `BridgeFinanceApi` wiring. Flip from
   mock to real.

Step 2 is fully demoable before any Plaid/secret work exists.

## Open decisions

- **Token encryption mechanism** — pgsodium / Vault vs app-level encrypt
  in the edge function with a `FINANCE_ENC_KEY` secret. Leaning
  edge-function-level for portability.
- **Plaid plan + products** — Sandbox is free; which paid Plaid tier for
  launch, and do we add Investments/Liabilities products beyond
  Transactions in v1 or defer.
- **Categorization** — lean on Plaid's `personal_finance_category` for v1;
  a `core/` rules layer + (later) an AI pass via the existing AI bridge is
  the upgrade path.
