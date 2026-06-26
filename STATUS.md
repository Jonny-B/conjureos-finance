# Project status — Conjure Finance

> **Last updated:** 2026-06-25
> **Status: ⏸️ PAUSED.** Development is on hold while we focus on the ConjureOS
> platform and the Recipe app. Pick this back up later — everything below is
> where we left it.

## TL;DR

- The app is **feature-complete for a mock-data demo** and went through a full
  **Rocket Money-style UI redesign** (responsive: phone + desktop).
- It is currently **`0.5.3`** (latest built bundle).
- **Removed from BOTH the dev and prod ConjureOS App Stores on 2026-06-25**
  (clean total removal — store rows, versions, installs, and storage objects
  all deleted). It is no longer installable/updatable from the store. The code
  is intact in this repo; re-publishing later is just another backdoor (or CI)
  publish.
- The **real backend (Plaid + server-side encryption) is parked** until the LLC
  clears. The app runs on **mock data** by default and that's what shipped.

## What we've built (the whole arc)

**Core app**
- A privacy-first personal-finance app (Mint / Rocket Money style): category
  breakdowns, spending charts, transaction search, budgets.
- A **client-side AI orchestrator** that categorizes a month of transactions for
  you, auto-applies the confident ones, and routes the unsure ones to a review
  queue. Driven either in-app or by the ConjureOS orchestrator via declared
  `conjureos.actions` (`categorizeTransactions`, `findRecurring`,
  `buildBudgetFromHistory`).
- Pure-compute features (no backend): recurring/subscription **detection**,
  **net worth** (+ manual assets & debts), **spending alerts**, **budget
  auto-suggest** from history.

**The Rocket Money-modeled redesign (this stretch of work)**
- Responsive shell that works on **phone AND desktop**: phone gets a bottom tab
  bar + a slim gradient header; desktop gets a sidebar with grouped nav.
- Screens: **Dashboard** (swipeable hero cards — spend-this-month + net worth —
  an attention banner, and an accounts list), **Spending** (period segments +
  income-vs-spend bars + category donut), **Budget** (summary cards + category
  list), month-grouped **Transactions**, **Recurring** ("coming up"), and an
  **Extras** menu (was "More").
- **Removed Goals** (decided it was bloat). Credit score / bill negotiation /
  subscription cancellation are intentionally out of scope.
- Replaced all emoji with **Font Awesome** SVG icons (`src/lib/icons.tsx`);
  merchant "logos" are colored initials.
- Slimmed the mobile header so it doesn't hog space on phones.
- Verified at 390px (phone) and 1280px (desktop) with Playwright screenshots.

**Backend security (lives in the ConjureOS repo, not here)**
- The server-readable Plaid path got **column-level encryption at rest**
  (security layer #4): sensitive `finance.*` columns are AES-GCM ciphertext,
  keyed by a secret in the edge-function store. Shipped to dev + prod via CI
  (migration 088). Dev sandbox secrets set; prod secrets parked for post-LLC.
- This is **NOT** end-to-end (Plaid sync is server-side), but a stolen DB dump is
  ciphertext. Rotation/recovery runbook: `FINANCE_ENCRYPTION.md` in the ConjureOS
  repo.

## Where the code is

- Branches `dev` and `claude/rocket-money-conjure-budget-yecghb` are **aligned**
  at the same tip. `dev` is the integration branch.
- Uses **cui `0.3.1`** (`@conjureos/ui`, imported as CSS).
- `npm run dev` runs everything on mock data — no backend or ConjureOS needed.
- Tests: `npm test` (vitest, ~31 tests). Typecheck: `npm run typecheck`.

## When we resume — the parked work

1. **Plaid (after the LLC clears).** Wire the real backend: set the prod
   `FINANCE_DEK` + `PLAID_*` secrets on the ConjureOS prod project (runbook in
   ConjureOS `FINANCE_ENCRYPTION.md` / `OPEN_QUESTIONS.md`), then flip
   `VITE_FINANCE_API`/sync env so the app reads live data instead of mock.
2. **Re-publish to the stores** once it's worth shipping again (backdoor or, once
   wired, CI — CI needs a `CONJUREOS_REPO_TOKEN` secret on this repo to resolve
   the cross-repo publish action).
3. **Synced-path UX** (the true-E2E `SyncedFinanceApi`): still has no passphrase
   UI (`vault.unlock()` is never called), so the encrypted-sync path is dormant.
4. **Real merchant logos / enrichment** via Plaid Enrich (the `src/enrich/`
   seam) — currently colored initials.

## How it was shipped (for future reference)

The normal CI store-publish pipeline isn't wired for this repo yet, so publishes
were done via a **service-role backdoor**: build the single-file bundle
(`npm run build:inline` → `dist/index.html`), upload it to the `store-apps`
storage bucket, insert a `store_app_versions` row (incrementing
`version_number`), and point `store_apps.current_version_id` at it. The in-app
"update available" banner fires purely on
`current_version_number > installed_version_number`.
