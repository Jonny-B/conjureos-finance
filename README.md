# Conjure Finance

> **Status: ⏸️ paused** (2026-06-25) — development is on hold while we focus on
> the ConjureOS platform + Recipe app, and the app has been removed from the dev
> and prod App Stores (the listing is deleted, so no installed copy can update).
> It runs on demo data only: **Plaid production is not live** (ConjureOS Phase
> 61, waiting on the LLC). It was sealed on 2026-10-22 (`appType: "sealed"`, on
> `dev`; `main` waits on finance#24).
> See [`STATUS.md`](STATUS.md) for the full picture and how to resume.

A privacy-first personal finance app for ConjureOS — a Mint / Rocket Money
clone with category breakdowns, spending charts, transaction search, budgets,
and a categorizer that sorts your transactions for you and only asks about the
ones it's unsure of.

What it does today, with and without Plaid:

- **Without a backend (the only mode that ships):** everything runs on a
  deterministic in-memory demo dataset (`MockFinanceApi`, one simulated
  institution, "Conjure Bank"). Nothing is persisted or sent to a server; a
  reload starts from the seed again.
- **Plaid:** not wired. `VITE_BANK_PROVIDER=plaid` and `VITE_MERCHANT_ENRICH=plaid`
  select placeholders that throw "not enabled yet". The ConjureOS backend for it
  exists (see Plaid-ready seams) and runs against Plaid's sandbox on dev only;
  nothing in this app calls it.
- **Encrypted sync (`VITE_FINANCE_API=synced`):** built and unit-tested, but
  dormant (see Design goals).

Design goals, and how each is met:

- **The server can't see your data.** In the synced path, transactions are
  encrypted in the browser (PBKDF2 → AES-GCM) and the backend stores only opaque
  ids + ciphertext. See `src/crypto/` and the `conjureos-finance-backend` repo.
  That path has no passphrase screen yet (`vault.unlock()` is never called), and
  ConjureOS hands the SSO session token only to built-in apps, so it cannot run
  for a store install. The Plaid path that ConjureOS hosts is different: Plaid
  sync runs server-side, so that data is readable by the server, with sensitive
  columns encrypted at rest (ConjureOS `FINANCE_ENCRYPTION.md`).
- **We don't store your transactions server-side.** The synced path is a dumb
  encrypted key/value store keyed by opaque `(kind, id)` — no readable financial
  columns exist.
- **Contributors can build without backend access.** The UI talks only to a
  typed `FinanceApi`; a full in-memory mock implementation ships in-repo and is
  the default (`VITE_FINANCE_API=mock`). `npm run dev` just works.
- **Categorization is automated.** A client-side orchestrator auto-applies
  high-confidence categories and routes the rest to a review queue.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5174, runs on mock data, no backend needed
npm test           # vitest
npm run typecheck
npm run build          # dist/ with separate JS and CSS
npm run build:inline   # dist/index.html, one self-contained file (what a store publish ships)
```

## Architecture

```
 React UI  ─────────────►  FinanceApi (typed contract)
 (components, charts)         │
                             ├─ MockFinanceApi      in-memory, no backend, no crypto  ← default
                             └─ SyncedFinanceApi    decrypts/serves + re-encrypts on write
                                      │
                                      ├─ Vault (WebCrypto: PBKDF2 → AES-GCM, key stays in memory)
                                      └─ SyncTransport (wire contract)
                                             ├─ MockSyncTransport   in-memory (tests the crypto path offline)
                                             └─ HttpSyncTransport   conjureos-finance-backend edge functions (sync-pull, sync-push)
```

- `src/api/contract.ts` — `FinanceApi`, the only surface the UI depends on.
- `src/api/types.ts` — canonical domain model (source of truth for both repos).
- `src/api/mock/` — deterministic multi-month dataset + `MockFinanceApi`.
- `src/api/synced/` — E2E-encrypted implementation over a `SyncTransport`.
- `src/api/sync/transport.ts` — the wire contract the backend implements.
- `src/crypto/` — encryption primitives and the in-memory vault.
- `src/orchestrator/` — categorization engine (see below).

Swapping mock ↔ real is one line in `src/api/index.ts`, driven by env.

## The categorization orchestrator

`src/orchestrator/` runs entirely **client-side**, so plaintext never touches
our server. For each transaction it predicts a category + confidence, then:

- **≥ 0.85 confidence** → auto-applied (status `auto`).
- **below that / no match** → routed to the **Review** queue (`needs_review`)
  with a short reason, so the user only confirms the handful it was unsure of.

The inference engine is resolved at runtime in priority order:

```
tier credits  →  group key  →  user's own key (BYK)  →  heuristic (offline rules)
```

The heuristic engine needs no key and no network, so categorization **always
works**, and it is the only engine a shipped build reaches. Nothing fills the
tier or group credential (they are hooks for ConjureOS to set), and the AI path
is on only when `VITE_INFERENCE_PROVIDER=anthropic`; the default and the publish
workflow leave it at `heuristic`. When on, it calls the Anthropic API directly
with `VITE_ANTHROPIC_API_KEY` or the key typed into Settings (kept in memory for
the session), not ConjureOS's `ai.complete`, and falls back to the rules on any
error. See `src/orchestrator/index.ts`.

### Actions

The app declares three actions in its manifest (`package.json` →
`conjureos.actions`) and registers their handlers on load
(`src/store/FinanceContext.tsx` → `registerHostActions`). Standalone (plain
`npm run dev`) the registration is a no-op, so the app is unaffected.

- **`categorizeTransactions`** (`{ month? }`, write) — categorize, optionally one
  month. `month` is free text (`"February"`, `"Feb 2026"`, `"2026-02"`); omit it
  to cover every month. Month parsing lives in `src/orchestrator/month.ts`.
- **`findRecurring`** (read) — summarize subscriptions + recurring bills ("what
  subscriptions am I paying for?").
- **`buildBudgetFromHistory`** (write) — set monthly budgets from spending
  history ("set up my budget").

Each answers with its numbers and a one-line `message`. They declare only a
description: no `params` or `returns` schema. ConjureOS Chat offers an app's
actions only when they declare one, so **Chat never offers Conjure Finance**
(owner decision 2026-10-22: no Conjure Finance in Chat code; ConjureOS
`DECISIONS.md`). Whether Chat should offer a revived build that adds schemas is
an open owner question (ConjureOS `OPEN_QUESTIONS.md`).

## Analytics (`src/analytics/`)

Pure, dependency-free functions over the transaction set — no Plaid, no storage,
so they work identically on the mock and the encrypted-sync API and are unit
tested in `src/analytics/__tests__`:

- **`recurring.ts`** — recurring/subscription detection. Monthly is
  calendar-aware (a merchant seen ~once per month across several months), while
  weekly/biweekly require regular spacing, so habitual spend (groceries, coffee)
  is excluded. Powers the Recurring view + upcoming-bill/price-hike alerts.
- **`networth.ts`** — assets − liabilities across linked accounts.
- **`budgetSuggest.ts`** — per-category caps from the average of recent
  completed months + a buffer (Rocket Money's budget-wizard mechanic).
- **`alerts.ts`** — derived low-balance / over-budget / upcoming-bill /
  price-hike nudges.

## Plaid-ready seams (`src/sync/`, `src/enrich/`)

Features that ultimately want Plaid prod are built behind interfaces with a mock
implementation today, so the real version can drop in via a config flag:

- **`sync/bankProvider.ts`** — `BankProvider` (list/connect/sync/unlink). Mock
  simulates one linked institution; `VITE_BANK_PROVIDER=plaid` selects
  `PlaidBankProvider`, a typed placeholder whose connect, sync and unlink throw
  "not enabled yet". Drives the Settings → Bank connections card. The ConjureOS
  edge functions it will call exist in the ConjureOS repo: `plaid-link-token`,
  `plaid-exchange`, `plaid-list-items`, `plaid-sync`, `plaid-unlink`, and
  `finance-read` (decrypts a user's rows on read). They read and write the
  `finance` schema with sensitive columns AES-GCM encrypted at rest (migration 088,
  `FINANCE_ENCRYPTION.md` there). The Plaid secrets and `FINANCE_DEK` are set on
  dev (sandbox) only; the prod functions are dormant until the LLC clears
  (per `FINANCE_ENCRYPTION.md`).
- **`enrich/merchant.ts`** — `MerchantEnricher` for clean names + logos. Mock is
  a local glyph table (no network); `VITE_MERCHANT_ENRICH=plaid` selects a
  placeholder that throws. The merchant logo drawn in the lists is a coloured
  initial (`MerchantLogo` in `src/components/common.tsx`).
- **Net-worth** already supports manual assets, and **`Account.liability`**
  mirrors Plaid Liabilities — both populate from seed now, from Plaid later.
- **Alerts** deliver to ConjureOS notifications in the foreground (the `notify`
  permission); background push (app closed) is the remaining backend seam: Plaid
  webhook → edge function → `notify`.

## Features

On phone a bottom tab bar (Dashboard, Recurring, Spending, Transactions, Extras);
on desktop a sidebar. Extras holds Budget, Net worth, Categories, Review, Alerts
and Settings.

- **Dashboard** — swipeable hero cards (spend this month against last, and net
  worth), an attention banner when an alert needs a look, and the accounts list.
- **Spending** — week / month / quarter / year, income vs spend bars, and the
  category breakdown as a donut.
- **Transactions** — month-grouped, with full-text search, and filters by
  category, account and categorization status, and sort by date or amount.
- **Recurring** — detected subscriptions, bills and income with cadence, next
  charge date, and monthly totals; a "coming up" list.
- **Budget** — monthly caps with live progress, plus one-tap "Build from
  history" to size every category from past spending.
- **Net worth** — assets − liabilities across linked accounts + manual assets
  (home, car, mortgage) you add and remove; debt detail (APR, due date, min
  payment).
- **Categories** — system + custom categories.
- **Review** — the categorizer's uncertainty queue; run it, confirm/override.
- **Alerts** — low balance, over/near budget, upcoming bills, price increases
  (also pushed to ConjureOS notifications).
- **Settings** — account, bank connections (demo), privacy/encryption status and
  the inference engine. The account card shows the signed-in ConjureOS user only
  where the host gives the app its SSO bridge (`window.__conjureos.auth`, built-in
  apps only); a store install shows "Signed out", and a plain `npm run dev` shows
  "Running standalone".

Savings goals are in the data model (`FinanceApi.listSavingsGoals` and friends,
seeded in the mock) but have no screen; the UI dropped them in the 0.5.0
redesign. Credit score, bill negotiation and subscription cancelling are out of
scope.

## Styling

Uses the official ConjureOS design system, [`@conjureos/ui`](https://www.npmjs.com/package/@conjureos/ui)
("Modern Whimsy"), so the app matches the OS. `dist/ui.css` is imported at the top of
`src/index.css` and `<html>` carries `class="cui-ui"` (tokens + primitives).
Components use the `cui-*` primitive classes — `cui-card`, `cui-button`
(`--primary`/`--ghost`), `cui-input`, `cui-pill`, `cui-chip` — with two
app-local modifiers (`btn-sm`, `pill-neutral`) layered on top. App-specific
structures the system doesn't cover (sidebar/nav, tables, stat tiles, progress
bars) keep local classes whose tokens (`--accent`, `--bg`, …) alias the
`--cui-*` palette, so an OS restyle propagates automatically. Inside ConjureOS
the same stylesheet is also served at `/_conjureos/ui/v1.css`.

## Configuration

See `.env.example`. The important switch is `VITE_FINANCE_API` (`mock` default,
or `synced` to use the encrypted backend). `VITE_INFERENCE_PROVIDER`
(`heuristic` default, or `anthropic`), `VITE_BANK_PROVIDER` and
`VITE_MERCHANT_ENRICH` (`mock` default, or `plaid`, a placeholder) pick the
other seams; the last two are not in `.env.example`.

## Publishing

The workflow (`.github/workflows/publish-store.yml`, slug `finance`) builds
`npm run build:inline` and publishes through the shared ConjureOS action: Run
workflow goes to the DEV project, a published release to PROD. The workflow only
adds versions to a listing that exists, and Finance's listing was deleted from
both stores on 2026-06-25, so a publish needs a one-time first publish with
ConjureOS's `scripts/publish-app.mjs --first-publish` first.
