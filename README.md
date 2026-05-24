# Conjure Finance

A personal finance app in the lineage of **Mint** and **Rocket Money** —
account aggregation, spend categorization, budgets, net worth, and
subscription detection. Built as a **keystone app for ConjureOS**.

Open-source frontend, private backend. Bank data via **Plaid**.

## Quick start (no backend needed)

```bash
npm install
npm run dev
```

The app ships with a **mock data layer on by default**. With no backend
configured, it runs against `MockFinanceApi` — realistic fixture accounts,
transactions, budgets, and subscriptions — so you can develop the entire
UI with **zero credentials and no Plaid account**. This is the supported
path for contributors.

When the app runs inside ConjureOS (signed in, as a keystone app), it
automatically switches to the real backend via the ConjureOS finance
bridge. No code change — selection is automatic based on whether the
bridge is present.

## Architecture

- **Open** (this repo): React app + pure `core/` logic + the `FinanceApi`
  contract + the mock. No secrets, no Plaid code, no SQL.
- **Private** (`conjureos-finance-backend`): Supabase edge functions
  (Plaid) + the `finance` Postgres schema. Controlled by the maintainer.
- **Platform** (`ConjureOS`): a keystone-only bridge that lets this app
  reach the private backend with the user's session, without the app ever
  holding a token.

Layers: `core/` (pure domain) → `api/` (`FinanceApi` + Mock/Bridge impls)
→ `state/` (hooks) → `ui/`. Lower layers never know about higher ones.

Full design: [`DESIGN.md`](DESIGN.md).

## Contributing

You only need this repo. Run on the mock, build features behind the
`FinanceApi` interface, keep backend specifics out of the open code. If a
feature needs new backend data, add it to the `FinanceApi` contract + the
mock here; the maintainer wires the private implementation.
