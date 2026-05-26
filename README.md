# Conjure Finance

A privacy-first personal finance app for ConjureOS — a Mint / Rocket Money
clone with category breakdowns, spending charts, transaction search, budgets,
and an **AI orchestrator that categorizes your transactions for you** and only
asks about the ones it's unsure of.

Design goals, and how each is met:

- **The server can't see your data.** Transactions are encrypted in the browser
  (PBKDF2 → AES-GCM). The backend stores only opaque ids + ciphertext. See
  `src/crypto/` and the `conjureos-finance-backend` repo.
- **We don't store your transactions server-side.** The server is a dumb
  encrypted key/value sync store keyed by opaque `(kind, id)` — no readable
  financial columns exist.
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
npm run build
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
                                             └─ HttpSyncTransport   Supabase edge functions
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
works** — AI just improves accuracy when budget/credentials exist
(`VITE_INFERENCE_PROVIDER=anthropic`). See `src/orchestrator/index.ts`.

## Features

- **Dashboard** — spending-by-category pie, monthly spend-vs-income bars,
  category breakdown, top merchants, selectable time range.
- **Transactions** — full-text search, filter by category/account/status, sort.
- **Review** — the orchestrator's uncertainty queue; run it, confirm/override.
- **Budgets** — monthly caps with live progress against current-month spend.
- **Categories** — system + custom categories.
- **Account** — as a ConjureOS default app it reuses the OS session via SSO
  (`window.__conjureos.auth`); a sidebar user badge shows who's signed in, and
  Settings shows the account + identity source. Degrades to "standalone" when
  run outside ConjureOS.
- **Settings** — account, privacy/encryption status, and inference engine controls.

## Configuration

See `.env.example`. The important switch is `VITE_FINANCE_API` (`mock` default,
or `synced` to use the encrypted backend).
