# Conjure Finance — internals, decisions, and how to restart

> **Working draft for the in-app "ConjureOS Internals" doc.** Every `##` heading
> below is one `SECTIONS` entry. The `id:` line under each heading is the stable
> kebab-case id; the heading text is the `title`; everything after is the `body`.
> Port is mechanical — copy each block, drop the `id:` line into the entry.
>
> **Never put a key value in this file.** `FINANCE_DEK`, `PLAID_SECRET` and
> friends are named here, never reproduced. The prod `FINANCE_DEK` must never
> transit an AI session (standing project rule, `OPEN_QUESTIONS.md`).

---

## Conjure Finance at a glance

`id: finance-overview`

Conjure Finance is a ConjureOS **anchor app** — a Mint / Rocket Money-style
personal finance app that ships in the ConjureOS App Store. Frontend lives in
its own repo (`Jonny-B/conjureos-finance`); its **backend lives inside the
ConjureOS repo** (`supabase/migrations/035…`, `088…` + the `plaid-*` /
`finance-read` edge functions), per the 2026-05-28 anchor-app backend
consolidation decision.

**Current state, in one paragraph.** The app is **paused** as of 2026-06-25, at
version **`0.5.3`**, feature-complete as a **mock-data demo** with a responsive
Rocket-Money-modeled UI. It was **removed from both the dev and prod App
Stores** on the same day — store rows, versions, install records and storage
objects deleted on each project. **The code is fully intact.** The backend
field-encryption layer (migration 088) is **deployed to dev and prod and stays
deployed**, dormant on prod because its secrets are deliberately unset. Real
Plaid data is parked pending the LLC.

**Where things physically are:**

| Thing | Location |
| --- | --- |
| Frontend | `Jonny-B/conjureos-finance`, integration branch `dev` (tip `45653c1`, `0.5.3`) |
| Finance schema | ConjureOS `supabase/migrations/035_finance_schema.sql` |
| Field encryption | ConjureOS `supabase/migrations/088_finance_field_encryption.sql` + `supabase/functions/_shared/fieldCrypto.ts` |
| Edge functions | ConjureOS `supabase/functions/{plaid-link-token,plaid-exchange,plaid-sync,plaid-list-items,plaid-unlink,finance-read}/` |
| Key runbook | ConjureOS `FINANCE_ENCRYPTION.md` |
| Security backlog | ConjureOS `SECURITY_FIXES.md` → "Finance data security"; issues #387–#390 |
| Frontend status memo | `conjureos-finance/STATUS.md` |

> **Checkout warning.** The branch checked out locally at
> `/home/user/conjureos-finance` may be `claude/ai-integration-conjureos-16137t`
> (`0.4.0`) — that is **behind** the real tip. All `src/…:line` references in
> this document are against **`origin/dev` @ `45653c1` (`0.5.3`)**. Run
> `git checkout dev && git pull` before reading code.

---

## Why development was paused

`id: finance-why-paused`

**Date: 2026-06-25. Reason: priority, not failure.** Nothing about Finance broke.
The owner shifted attention to the ConjureOS platform itself and to the Recipes
anchor app, and Finance was the cheapest thing to put down because **its next
increment was blocked on something outside the codebase anyway** (see
`finance-blocked-on-llc`).

The reasoning, spelled out from `ConjureOS/STATUS_ARCHIVE.md` (2026-06-24/25
entry) and `conjureos-finance/STATUS.md`:

1. **The app had reached a natural plateau.** After the `0.5.x` Rocket-Money
   redesign, every feature that could be built *without real bank data* was
   built — analytics, budgets, recurring detection, net worth, alerts,
   orchestrator actions. The remaining work all needed live Plaid.
2. **Live Plaid needs a legal entity.** Plaid production access requires the
   LLC. Until that clears, the app can only ever run on mock/seed data, so more
   frontend polish buys nothing a user can feel.
3. **Platform work compounds; a paused app doesn't rot.** ConjureOS platform
   improvements (store, orchestrator, bundler, chat, mobile) lift every anchor
   app at once. Recipes was the app with real users engaging with it.
4. **Leaving it published had ongoing cost.** A store-listed app that shows
   fabricated transactions invites bug reports, support load, and — worse —
   the impression that it is a real finance product. Pulling it removed that
   surface for the duration of the pause.

**The pause was recorded, not implied.** `conjureos-finance/STATUS.md` and
`README.md` were both updated with the paused banner in commit `45653c1`, and
`ConjureOS/STATUS_ARCHIVE.md` carries the dated entry. There is no hidden
"we'll be back next week" assumption — this is an indefinite hold with a
defined unblock condition (the LLC).

---

## What "removed from the stores" actually destroyed

`id: finance-store-removal`

This is the part most likely to be misremembered, so be precise.

**Destroyed, on BOTH the dev and prod Supabase projects, verified as 0 rows on
each:**

- the `public.store_apps` row for slug `finance`;
- **all** `public.store_app_versions` rows for it (dev was at store
  `version_number` **8**, prod at **5**, both carrying app `0.5.3`) — these
  cascade off `store_apps` (`032_app_versioning.sql:34`);
- **all** `public.store_app_installs` rows — also a cascade
  (`032_app_versioning.sql:120`);
- the published HTML **storage objects** in the `store-apps` bucket.

**Survived, untouched:**

- **The entire source repo.** Nothing was deleted from `conjureos-finance`.
- **The backend.** The `finance.*` schema, migration 088 and every `plaid-*` /
  `finance-read` edge function remain deployed on dev and prod. Removing the
  store listing did not touch the backend.
- **Users' installed copies.** A ConjureOS store install writes the app into
  the user's own VFS at `/apps/finance/…`. Deleting `store_app_installs`
  removes the *store linkage* (the app no longer appears as installed-from-store
  and can never be updated or re-verified), but the user's files and app data
  are theirs and are still there. Two prod installs existed at the time of the
  final publish (they were on store v3 and were offered the update to v5).
- **`STORE_TAGS`' `finance` category** in the ConjureOS client
  (`src/platform/appStore.ts:42`) — that is a generic tag, unrelated to the app.

**Why "total removal" rather than unlisting.** ConjureOS does support an
unlisted/private visibility state, but the decision was a clean total removal:
a paused app should not be discoverable, installable, *or* half-present in
someone's store list. The trade-off accepted was that re-publishing later costs
a **first publish**, not an update (see `finance-ci-publishing` — this is a real
gotcha).

**Re-publishing is cheap in effort, but it is a NEW listing.** New
`store_apps` row, new id, store versions restart at 1, and previous installs do
not re-link. That is expected and fine; just don't promise anyone their old
install will resume updating.

---

## Where the app actually got to (`0.5.3`)

`id: finance-where-we-got-to`

Everything below **works today** on mock/seed data with `npm run dev` — no
backend, no ConjureOS shell required.

**The shell (Rocket Money-*modeled*, not copied — it keeps the ConjureOS dark
theme and accent, not Rocket Money's crimson).** Responsive: on a phone a bottom
tab bar plus a slim gradient header; on desktop a sidebar with grouped nav.
Verified at 390px and 1280px with Playwright screenshots. Nav definition:
`src/components/Layout.tsx:42-57`; the five gradient-header routes are pinned at
`Layout.tsx:69` and everything reached from Extras gets a plain compact
back-header instead.

**Screens** (routes: `src/App.tsx:26-40`):

| Route | Screen | What it does |
| --- | --- | --- |
| `/` | **Dashboard** | Swipeable hero cards (spend-this-month, net worth), an attention banner, accounts list, category pie, spend-vs-income bars, top merchants |
| `/spending` | **Spending** | Period segments, income-vs-spend bars, category donut |
| `/budgets` | **Budget** | Summary cards + per-category caps with live progress, one-tap "Build from history" |
| `/transactions` | **Transactions** | Month-grouped, full-text search, filter, sort, merchant initials-as-logos |
| `/recurring` | **Recurring** | Detected subscriptions / bills / income, cadence, next charge, "coming up", monthly totals |
| `/net-worth` | **Net worth** | Assets − liabilities across accounts + manual assets, debt detail (APR, due date, min payment) |
| `/review` | **Review** | The categorizer's uncertainty queue — confirm or override |
| `/alerts` | **Alerts** | Low balance, near/over budget, upcoming bill, price increase |
| `/categories` | **Categories** | System + custom categories |
| `/more` | **Extras** | The secondary menu (renamed from "More"; the route is still `/more`) |
| `/settings` | **Settings** | Account/SSO, privacy, inference engine, bank connections |

**Other shipped characteristics:**

- **Font Awesome SVG icons everywhere** (`src/lib/icons.tsx`) — all emoji were
  removed from the chrome in `0.5.1`. Merchant "logos" are colored initials.
  (The `src/enrich/merchant.ts` mock table still carries emoji; it is the
  enrichment *seam*, not the rendered chrome.)
- **`0.5.2`/`0.5.3` polish:** picked up `@conjureos/ui` `0.3.1` (iOS touch-zoom
  fix on form controls) and slimmed the mobile gradient header, which had been
  ballooning to ~123px because the `.app` grid's `align-content` stretched the
  short header row; pinned to `grid-template-rows: auto 1fr` so it is
  content-sized (~38px).
- **Routing quirk that must not be undone:** `MemoryRouter`, not
  `HashRouter`/`BrowserRouter` (`src/App.tsx:1-7`). ConjureOS runs apps in an
  opaque-origin srcdoc iframe where the History API throws, which crashed the
  app at load with a bare `Script error.` See ConjureOS `TROUBLESHOOTING.md:433`.
- **Build never minifies** (`vite.config.ts`) because ConjureOS lets users and
  the in-OS AI read and modify installed app source.
- **Tests:** `npm test` (vitest) over four suites — `src/analytics/__tests__`,
  `src/api/__tests__`, `src/orchestrator/__tests__`, `src/__tests__/seams.test.ts`
  (~31 assertions). `npm run typecheck` is `tsc -b --noEmit`. Both were green at
  `0.5.3`.

---

## What is blocked, and on what

`id: finance-blocked-on-llc`

**One root blocker: real Plaid data requires the LLC.** Plaid production access
is granted to a legal entity. Everything downstream of "the app shows the user's
actual bank transactions" waits on that.

**Consequences, stated exactly:**

- **Dev is wired to the Plaid *sandbox*.** On the dev Supabase project
  (`mqpvjlsywrptefgwuztn`) the finance edge-function secrets **are set**:
  `FINANCE_DEK`, `FINANCE_DEK_ID=v1`, `PLAID_CLIENT_ID`, `PLAID_SECRET`,
  `PLAID_ENV=sandbox`. Dev finance functions are live against Plaid sandbox.
- **Prod is deliberately dormant.** On the prod project
  (`ntgelbtepecqsqloxmct`) the functions are **deployed** and migration 088 is
  **applied**, but `FINANCE_DEK` and `PLAID_*` are **not set**. Any call throws
  `FINANCE_DEK is not set on this function` (`_shared/fieldCrypto.ts:71`) or
  returns `503 plaid_not_configured` (`plaid-sync/index.ts:125`). **This is
  intended, not a bug** — do not "fix" it by setting secrets casually.
- **The prod key must be generated by the owner, out of band.** From
  `OPEN_QUESTIONS.md`: generate a **fresh** prod `FINANCE_DEK`
  (`openssl rand -base64 32`), save it in a password manager **immediately**,
  then set `FINANCE_DEK`, `FINANCE_DEK_ID=v1`, production `PLAID_CLIENT_ID` /
  `PLAID_SECRET`, `PLAID_ENV=production` — **before any real finance row is
  written**. Never reuse the dev sandbox key. **The prod root key must never
  transit an AI session.**
- **The dev key has no out-of-band backup.** It was generated in-container and
  intentionally never printed. That is acceptable for sandbox — recovery is
  "wipe the encrypted rows and re-sync from Plaid sandbox." If you ever want a
  reproducible dev key, overwrite it with one you generated and saved yourself.

**A second, smaller blocker: the frontend has no live-backend client.** See
`finance-known-gaps` — the app's `synced` mode still targets the *retired* E2E
`encrypted_records` transport, not the shipped `finance-read` / `plaid-*`
backend. Plaid access alone will not light the app up; a `FinanceApi`
implementation over `finance-read` has to be written.

---

## Deliberate scope cuts — do not re-propose these

`id: finance-scope-cuts`

These were cut on purpose. Each one has a reason. Re-proposing them without new
information is re-litigating a settled call.

**Cut: Savings Goals.** Owner's call during the `0.5.0` redesign: **bloat**. A
goals tracker whose "autosave" contributions are simulated (no real money
movement is possible without a banking partner) is a toy screen that adds a nav
slot and implies a capability the app does not have.

- **Removed:** the `Goals` page and its nav entry. `src/components/Goals.tsx` no
  longer exists at the `dev` tip; `Layout.tsx:51` and `More.tsx:26` both carry
  an explicit "Goals + Credit Score are intentionally absent" comment so nobody
  re-adds them by accident.
- **Deliberately NOT removed:** the *data layer*. `SavingsGoal`
  (`src/api/types.ts:55-61`), the `savings_goal` `RecordKind`
  (`src/api/sync/transport.ts:20`), `listSavingsGoals` /`upsertSavingsGoal` /
  `deleteSavingsGoal` on the API contract (`src/api/contract.ts:85-87`), their
  mock implementations (`src/api/mock/mockApi.ts:162-181`), the synced-path
  branch (`src/api/synced/syncedApi.ts:92`) and `SEED_GOALS`
  (`src/api/mock/data.ts:46`) are all still there. **This is intentional**: the
  cut was a product/UI decision, and leaving the plumbing means re-adding Goals
  later is a UI job, not a data-model migration. Do not "clean up" the dead
  types thinking they are cruft — and equally, do not read their presence as
  "Goals is still a feature."

**Cut: Credit score.** Out of scope. It is a different data product (bureau
integration, its own compliance surface), it is Rocket Money's lead-gen hook
rather than a budgeting feature, and it needs a partner we do not have.

**Cut: Bill negotiation.** Out of scope. It is an *operations* business — a
human or an agent calling providers on the user's behalf — not software. It
carries authority-to-act and consumer-protection exposure that a solo
pre-revenue product should not take on.

**Cut: Subscription cancellation.** Out of scope, same shape as bill
negotiation: it means acting on the user's accounts at third parties, with all
the liability that implies. Conjure Finance **detects** subscriptions
(`src/analytics/recurring.ts`) and shows you what you are paying for. Acting on
them is the user's job.

The three cuts above were made together and recorded in `STATUS_ARCHIVE.md`
(2026-06-23 entry) as "the owner-dropped trio" — the 2026-06-23 build-out
explicitly shipped "everything feasible **except** the owner-dropped trio."

---

## What resuming would actually take

`id: finance-restart-checklist`

In dependency order. Steps 1–2 are prerequisites; 3–6 can overlap; 7 is last.

**1. Reorient (30 minutes, no code).** Read, in order:
`conjureos-finance/STATUS.md`, this document, ConjureOS `FINANCE_ENCRYPTION.md`,
ConjureOS `SECURITY_FIXES.md` → "Finance data security". Then
`git checkout dev && git pull` in `conjureos-finance` and confirm you are at
`0.5.3` or later — **not** on a stale `claude/*` branch.

**2. Confirm the app still builds and passes.** *Idempotent.*
```
npm ci
npm run typecheck        # tsc -b --noEmit
npm test                 # vitest, 4 suites
npm run dev              # http://localhost:5174, mock data, no backend
```
Expect a clean typecheck, all tests green, and a working app on seed data. Also
run `npm run build:inline` and open `dist/index.html` directly — that single
self-contained file is what the store ingests, and a crash there is a real
store-build bug that `npm run dev` will not show you.

**3. Set the prod secrets — owner-only, before any real row is written.**
Follow `FINANCE_ENCRYPTION.md` → "Initial setup" exactly. Generate a **fresh**
prod `FINANCE_DEK`, back it up in a password manager first, then set
`FINANCE_DEK`, `FINANCE_DEK_ID=v1`, production `PLAID_CLIENT_ID` /
`PLAID_SECRET`, `PLAID_ENV=production` on the prod project. **Do this yourself;
the prod key must never transit an AI session.** Secrets are read at
invocation, so no redeploy is needed. Losing this key with no backup is
permanent, unrecoverable loss of every encrypted finance row.

**4. Close the backend gaps before pointing the app at live data.** See
`finance-known-gaps` for the detail. At minimum:
   - ship a migration adding `finance.delete_vault_secret` (currently missing on
     both projects — `plaid-unlink` calls an RPC that does not exist);
   - decide and implement how `finance.transactions.user_category` gets
     encrypted, or stop the client writing it directly;
   - land the Plaid webhook → `plaid-sync` path if background refresh matters.

**5. Write the live `FinanceApi` implementation.** This is the biggest piece of
actual work and the one most likely to be underestimated. The frontend's
`synced` mode currently speaks the retired E2E `encrypted_records` wire
contract; the shipped backend is the server-readable `finance.*` schema behind
`finance-read`. Build a `RestFinanceApi` that maps `finance-read`'s
`{accounts, transactions}` onto `src/api/types.ts`, wire it into the factory at
`src/api/index.ts:28-41` behind a third mode, and fill in `PlaidBankProvider`
(`src/sync/bankProvider.ts:92-109`) against `plaid-link-token` →
`plaid-exchange` → `plaid-sync` → `plaid-unlink`.

**6. Fix the stale end-to-end-encryption messaging.** `README.md` (top bullets),
`Layout.tsx:126` ("End-to-end encrypted" badge) and `Settings.tsx:88-92` all
still claim the server cannot read your data. That is true of the *mock* and of
the abandoned E2E prototype; it is **not** true of the Plaid path that shipped.
Correct these before any user sees live data — an inaccurate privacy claim is a
liability, not a cosmetic bug.

**7. Re-publish to the store — and expect a FIRST publish, not an update.**
The `store_apps` row was deleted, so the existing CI workflow will fail with
`No existing store app found for slug "finance"`. See `finance-ci-publishing`
for the exact fix. Also set the `CONJUREOS_REPO_TOKEN` secret on the finance
repo, which CI needs and which was never added.

---

## Architecture

`id: finance-architecture`

**Shape:** a plain React 18 + TypeScript + Vite SPA. React Router
(`MemoryRouter`), Recharts for charts, `@conjureos/ui` (`0.3.1`) for the
ConjureOS design system, Font Awesome for icons. It runs standalone in a browser
*and* inside the ConjureOS sandboxed iframe; every host integration degrades to
a no-op when the bridge is absent.

**The one architectural rule:** the UI depends on exactly one interface,
`FinanceApi` (`src/api/contract.ts`). Nothing in `src/components/` knows whether
data came from memory, ciphertext, or a bank.

```
 React UI (components, charts)
        │
        ▼
   FinanceApi                       ← src/api/contract.ts, the ONLY UI surface
        ├── MockFinanceApi          ← src/api/mock/, in-memory seed  [DEFAULT]
        └── SyncedFinanceApi        ← src/api/synced/, decrypt→serve→re-encrypt
                 ├── Vault          ← src/crypto/, PBKDF2 → AES-GCM, key in memory
                 └── SyncTransport  ← src/api/sync/transport.ts (wire contract)
                        ├── MockSyncTransport   in-memory (tests crypto offline)
                        └── HttpSyncTransport   Supabase edge functions
```

Selection happens in exactly one place — `buildFinanceApi()` at
`src/api/index.ts:28-41`, driven by `VITE_FINANCE_API` (`mock` | `synced`,
default `mock`).

> **Read this before trusting the diagram.** The `synced` branch targets the
> **abandoned** end-to-end-encrypted `encrypted_records` backend, which is not
> what got built. It is dormant (`vault.unlock()` is never called — there is no
> passphrase UI), so today the app is mock-only in practice. See
> `finance-known-gaps`.

**Layer map:**

| Directory | Role |
| --- | --- |
| `src/api/` | Contract, canonical types, mock + synced implementations, wire transport |
| `src/analytics/` | Pure compute: recurring detection, net worth, alerts, budget suggest |
| `src/orchestrator/` | Client-side categorization engine + inference provider routing |
| `src/sync/` | `BankProvider` seam (Plaid drop-in point) |
| `src/enrich/` | `MerchantEnricher` seam (Plaid Enrich drop-in point) |
| `src/crypto/` | PBKDF2 → AES-GCM primitives + in-memory vault (E2E prototype) |
| `src/platform/` | ConjureOS host bridge: SSO, notify, action registration |
| `src/store/` | `FinanceContext` — app state, action handlers, run announcements |
| `src/components/` | Screens + shared primitives |
| `src/lib/` | Formatting helpers, the central Font Awesome icon registry |

**ConjureOS host integration** (`src/platform/host.ts`), all optional:

- `auth.getUser` / `auth.getAccessToken` — **built-in/default apps only**; used
  for SSO so the app reuses the OS session.
- `auth.whoami()` — the Phase-30g safe identity subset granted to *all* apps
  (`signedIn`, `email`, `persona`, `isAdmin`). Drives the sidebar user badge.
- `notify` — foreground alert delivery (`host.ts:122-130`), fired from
  `Layout.tsx:93`. Background push (app closed) is an unbuilt backend seam:
  Plaid webhook → edge function → `notify`.
- `actions.register` — cross-app action handlers (`host.ts:138-149`).

---

## The data model

`id: finance-data-model`

`src/api/types.ts` is the canonical domain model — both implementations
materialize the same shapes, so the UI never branches on data source.

**Money is always integer cents** (`Cents`), signed: **negative = money out,
positive = money in**. Note this is the **opposite** of Plaid's own convention
(Plaid: positive = outflow), so any live-data adapter must flip the sign —
`plaid-sync` stores Plaid's convention verbatim
(`plaid-sync/index.ts:79-80`).

**Core entities:**

- **`Account`** (`types.ts:20-32`) — `id`, `name`, `institution`, `mask`,
  `type` (`checking|savings|credit|investment|loan|cash`), `balanceCents`,
  `currency`, optional `liability`.
- **`LiabilityDetail`** (`types.ts:35-40`) — `aprPct`, `nextPaymentDate`,
  `minPaymentCents`, `statementBalanceCents`. A trimmed **Plaid Liabilities**
  shape on purpose: seeded in mock, populated from Plaid later with no type
  change.
- **`ManualAsset`** (`types.ts:44-51`) — a user-entered asset or debt that is not
  a linked account. `kind` ∈ `property|vehicle|cash|investment|other|debt`;
  `valueCents` is always **positive**, and `kind: "debt"` means "amount owed"
  and subtracts from net worth. This is what lets net worth include a house and
  a mortgage.
- **`SavingsGoal`** (`types.ts:55-61`) — `targetCents`, `savedCents`.
  **The UI for this was cut** (see `finance-scope-cuts`); the type and its API
  methods remain deliberately.
- **`Category`** (`types.ts:63-74`) — `color`, `icon`, `parentId`, `isSystem`
  (system categories ship with the app and cannot be deleted).
- **`Transaction`** (`types.ts:97-111`) — `id`, `accountId`, `date`,
  `amountCents`, `merchantName` (normalized), `rawDescription` (raw bank
  descriptor), `pending`, `source` (`mock|plaid|manual|import`), and a nested
  `categorization`.
- **`Categorization`** (`types.ts:83-95`) — the categorizer's audit record:
  `categoryId`, `status`, `confidence` (0..1), `suggestedCategoryId`,
  `reasoning` (shown in the Review queue), `orchestratorVersion`, `decidedAt`.
  `CategorizationStatus` is `uncategorized | auto | needs_review | confirmed`.
- **`Budget`** (`types.ts:115-120`) — per-category monthly `limitCents`.

**Derived read models** (computed client-side, never stored): `CategorySpend`,
`MonthlyPoint`, `BudgetProgress`, `DashboardSummary` (`types.ts:126-159`).

**`RecordKind`** (`src/api/sync/transport.ts:14-21`) is the sync store's opaque
partition key: `transaction | category | budget | account | manual_asset |
savings_goal | meta`. `manual_asset` and `savings_goal` were the two kinds added
in the 2026-06-23 build-out, threaded end to end through transport → store →
contract → both implementations.

**Server-side shape is different and does not match the client model.** The
`finance.*` schema (`035_finance_schema.sql`) mirrors Plaid, not the app:
`plaid_items` (one row per linked institution, with an `access_token_vault_id`
uuid pointer, never the token), `accounts`, `transactions` (`numeric(18,2)`
amounts, Plaid category taxonomy), `budgets`, `recurring`. Mapping between the
two is exactly the work item in `finance-restart-checklist` step 5.

---

## The analytics layer

`id: finance-analytics`

`src/analytics/` is **pure compute**: dependency-free functions over the
transaction/account/budget set. No storage, no network, no Plaid. That is what
lets them run identically on mock data and on live data, and be unit-tested in
`src/analytics/__tests__/analytics.test.ts`.

**`recurring.ts` — recurring / subscription detection** (`detectRecurring`,
`recurring.ts:101`). The signature Rocket Money feature, done locally. Two
detection paths, because real charges jitter:

- **Monthly is calendar-aware**: a merchant appearing ~once in each of several
  months is monthly, even when the day-of-month wanders (the 3rd one month, the
  25th the next). Naive day-gap banding misses this.
- **Sub-monthly (weekly / biweekly) requires *regular* spacing** — that is what
  separates a fortnightly paycheck from twice-a-month pharmacy runs.

Habitual spend (groceries, coffee, rideshare) recurs often with irregular gaps,
so it matches neither path and is correctly excluded. Minimum 3 occurrences.
Output `RecurringStream` (`recurring.ts:19-38`) carries cadence, `intervalDays`,
signed average and last amounts, predicted `nextDate`, `status`
(`active|inactive`), and a `priceIncrease` flag when the latest charge is
materially above an otherwise-stable stream. Helpers: `isSubscription`
(`:163`), `monthlyAmountCents` (`:168`, cadence-weighted), `cadenceLabel`
(`:179`). Powers the Recurring screen and the upcoming-bill / price-hike alerts.

**`networth.ts` — net worth** (`computeNetWorth`, `networth.ts:37`). Assets
minus liabilities across linked accounts **and** manual assets. `credit` and
`loan` account types are liabilities; manual `kind: "debt"` subtracts. Returns
`assetsCents`, `liabilitiesCents`, `netCents` and a per-row breakdown tagged
`source: "account" | "manual"`.

**`budgetSuggest.ts` — budget auto-suggest** (`suggestBudgets`,
`budgetSuggest.ts:20`). Rocket Money's budget-wizard mechanic: per expense
category, average the last N **completed** months (default 3 — the current
partial month is excluded so the average is not dragged down), add a buffer
(default 10%), round to a tidy figure. Income is excluded. Returns
`monthlyAvgCents`, `suggestedLimitCents` and `sampleMonths` so the UI can show
its work.

**`alerts.ts` — derived nudges** (`computeAlerts`, `alerts.ts:34`). Computed on
demand from current state, never stored. Five kinds (`alerts.ts:12-17`):
`low_balance` (checking/cash below `LOW_BALANCE_CENTS` = $200, `alerts.ts:28`),
`near_budget` (≥80%), `over_budget`, `upcoming_bill` (within 7 days, from the
recurring streams), `price_increase`. Severity-ranked `danger > warn > info`.
Foreground delivery to ConjureOS notifications happens in `Layout.tsx:93`.

**`dates.ts`** — shared date helpers (`isoToMs`, `addDays`, `daysBetween`,
`monthKey`, `maxDate`). These exist because a UTC-vs-local date-drift bug was
fixed here once already (2026-06-23 bug sweep); use them rather than doing
ad-hoc `Date` math.

**Design note worth preserving:** these functions take an optional `now`
parameter defaulting to *the most recent transaction date*, not the wall clock.
That is what makes them deterministic against a fixed seed dataset and testable
without freezing time.

---

## The Plaid seams

`id: finance-plaid-seams`

Features that ultimately need Plaid production were built **behind interfaces
with working mock implementations**, so the real version drops in by config
rather than by rewrite. This is the single most important structural decision
for restarting cheaply.

**The seam contract, in general:** an exported interface, a `mode: "mock" |
"plaid"` discriminant on every implementation, a mock that is fully functional
offline, a typed `plaid` placeholder that throws or returns empty, and a lazily
memoized factory that picks between them from a `VITE_*` env var. Nothing above
the factory ever branches on mode.

**`src/sync/bankProvider.ts` — `BankProvider`** (`:27-35`):
`listConnections()`, `connect(institution)`, `sync(connectionId?)`,
`unlink(connectionId)`. `MockBankProvider` (`:37-84`) seeds one linked
institution ("Conjure Bank") from the mock accounts so the Settings → Bank
connections card demos end to end; its `sync()` returns a real-shaped
`{added, modified, removed, syncedAt}` (Plaid's `/transactions/sync` counts)
with zeroes, because mock data is static. `PlaidBankProvider` (`:92-109`) is a
typed placeholder that throws `"Plaid bank sync is not enabled yet (awaiting
Plaid prod)"`. Factory at `:111-118`, switched by `VITE_BANK_PROVIDER`
(`mock` default | `plaid`). Sole consumer:
`src/components/BankConnections.tsx:8`.

**To make it real**, `PlaidBankProvider` must call the ConjureOS edge functions
in this order: `plaid-link-token` (get a Link token) → open Plaid Link →
`plaid-exchange` (public token → item, access token into Vault) →
`plaid-sync` (`{item_id}` → pull accounts + transactions) and
`plaid-list-items` / `plaid-unlink` for the connections list and disconnect.

**`src/enrich/merchant.ts` — `MerchantEnricher`** (`:14-17`):
`enrich(merchantName, raw?) → {displayName, emoji, domain?}`. The mock is a
local substring→glyph/domain table (`:25-57`, first hit wins) with **no network
call**. `PlaidMerchantEnricher` (`:78+`) is the placeholder for Plaid Enrich (or
a logo API keyed off `domain`). Note the shipped UI renders **colored initials**
for merchant logos as of `0.5.1`; real logos are a resume item.

**Two more Plaid-shaped surfaces that need no seam because the types already
match:** `Account.liability` is a trimmed Plaid **Liabilities** payload, and
manual assets already coexist with linked accounts in net worth. Both populate
from seed today and from Plaid later with no type change.

**The one seam that is *not* built: background alerts.** Alerts deliver to
ConjureOS notifications only while the app is open (`host.ts:122-130`). Firing
them with the app closed needs Plaid webhook → edge function → `notify`. There
is no placeholder for this; it is net-new backend work.

---

## Field encryption at rest (security layer #4) — DEPLOYED

`id: finance-field-encryption`

This is the most substantial engineered piece of the project and **it is live on
both dev and prod**, independent of the pause.

**The decision, and why it is not end-to-end.** The original epic implied an
E2E design, and an earlier prototype actually built one (a domain-blind
`public.encrypted_records` store: `(kind, id) + AES-GCM ciphertext + iv`, all
decryption in the browser behind a passphrase-derived key). **It was
abandoned**, deliberately, on 2026-05-28.

**True E2E is impossible for a Plaid-synced app.** Plaid sync is *server-side*:
the access token and `/transactions/sync` run in an edge function, so the server
necessarily holds plaintext at the moment of ingest. E2E would also rule out
everything the app needs — background sync on webhook (the server cannot see
what it is storing), any server-side categorization or recurring detection (no
readable amounts or categories), and cross-device sign-in without re-entering a
passphrase. The genuinely high-value secret is the Plaid **access token** (the
bearer the server uses to pull data), not the transaction stream.

So the app took the **standard fintech posture** (what Mint and Rocket Money
do), with a floor of five layers:

1. **RLS isolates users.** Every `finance.*` table is
   `user_id = auth.uid()`-scoped (`035_finance_schema.sql`).
2. **The Plaid access token is vaulted.** It goes into Supabase Vault;
   `finance.plaid_items.access_token_vault_id` is only a uuid pointer, and that
   column is *excluded* from the `authenticated` SELECT grant
   (`035:75-78`). Edge functions dereference it via the `service_role`-only
   SECURITY DEFINER wrappers `finance.create_vault_secret` /
   `finance.read_vault_secret` (`035:268-308`).
3. **Sensitive columns are ciphertext at rest** — this section.
4. …plus the four tracked layers in `finance-security-layers`.

**Threat model, stated plainly.** This defends against an **offline
data-at-rest leak**: a stolen DB dump, a leaked backup, a snapshot copied
somewhere it should not be. Those are ciphertext, and the key is **not in the
database** — it lives only in the Supabase edge-function secret store, so an
attacker needs *both*. It does **not** defend against a fully compromised live
server, because the server decrypts at runtime to serve the row's owner. **It is
not end-to-end, and the product must not claim that it is.**

**How it works:**

- **Algorithm:** AES-GCM-256, a fresh random 12-byte IV per value, authenticated
  (tampering fails decryption). Code: `_shared/fieldCrypto.ts`.
- **Envelope:** `"<keyId>.<base64(iv)>.<base64(ciphertext||tag)>"`
  (`fieldCrypto.ts:104`). The leading `keyId` is the whole trick — it is what
  makes rotation lossless.
- **Keyring** (`fieldCrypto.ts:66-90`): `FINANCE_DEK` (+ `FINANCE_DEK_ID`,
  default `v1`) is the **current** key — it encrypts new writes and decrypts its
  own envelopes. `FINANCE_DEK_OLD` (+ `FINANCE_DEK_OLD_ID`) is an **optional,
  decrypt-only** previous key, set only during a rotation window. Decrypt picks
  the key by the envelope's `keyId` (`:120`); encrypt always uses current
  (`:100`). The keyring is memoized per isolate; ids must match `[A-Za-z0-9_]+`
  and old ≠ current, both enforced.
- **Null semantics:** `null`/`undefined` encrypt to `null` and decrypt back to
  `null` — NULL stays NULL, so nullable columns behave normally.
- **Write path:** `plaid-sync` encrypts before upsert — accounts at
  `plaid-sync/index.ts:201-217`, transactions at `:307-323`.
- **Read path:** `finance-read` is the **decrypt chokepoint**
  (`finance-read/index.ts`). It identifies the caller from their JWT, reads
  **only their rows through an RLS-scoped anon client — no `service_role`**
  (`:44-48`, least privilege), decrypts (`:86-106`), and **fails closed**: any
  decrypt error returns `500 decrypt_failed` rather than leaking ciphertext
  (`:108-112`). Default limit 500 transactions, max 5000.
- **Encrypted columns** (migration `088_finance_field_encryption.sql`):
  `finance.transactions` — `amount`, `merchant_name`, `name`,
  `category_primary`, `category_detailed`, `user_category`;
  `finance.accounts` — `name`, `official_name`, `current_balance`,
  `available_balance`. They become `text` because they hold envelopes.
- **Deliberately plaintext:** ids, `plaid_*_id`, `posted_at`/`authorized_at`,
  `iso_currency_code`, `pending`, `payment_channel`, account `mask` (last 4),
  `type`/`subtype` — needed for sync, sorting and range queries, and low
  sensitivity.
- **Migration 088 is idempotent and data-safe**: it only alters a column whose
  type is not already `text`, and the tables were empty on first apply, so there
  was no data migration.

**The consequence you must design around:** amounts and balances are **no longer
SQL-aggregatable**. You cannot `sum(amount)` in Postgres any more. Analytics
decrypt in the edge function or the client — which is already how the app
computes its dashboards (`src/analytics/` is pure client-side compute), so this
cost was priced in.

**Rotation and recovery: read `ConjureOS/FINANCE_ENCRYPTION.md`.** It is the
operator runbook and it tags every step idempotent vs destructive. The shape:
generate a new key → promote it to current and demote the old to
`FINANCE_DEK_OLD` (decrypt-only) and redeploy → re-encrypt every row `v1`→`v2`
→ verify `select count(*) … where amount like 'v1.%'` returns **0** on every
encrypted column → **only then** unset `FINANCE_DEK_OLD` (**destructive**: any
row still on the old key becomes permanently unreadable). No downtime, no data
loss, if you follow that order.

**Back up `FINANCE_DEK` out of band.** It is not in the database, so a DB backup
alone cannot restore readability, and a dated DB restore is only useful paired
with the key that was current when it was taken. **Losing the key with no backup
is permanent, unrecoverable loss of every encrypted row.**

**Environments never share a key.** Dev and prod are separate Supabase projects
with separate `FINANCE_DEK`s. Never paste one env's key into the other's
command.

---

## Orchestrator actions

`id: finance-orchestrator-actions`

Conjure Finance exposes three actions to the **ConjureOS orchestrator**, so the
OS home chat can drive the app — type *"do February's budget and categorize
everything"* and the app opens and does it, no manual button press.

**Declared** in `package.json` → `conjureos.actions`, **handled** by
`registerHostActions(...)` at `src/store/FinanceContext.tsx:109`, which calls the
host bridge at `src/platform/host.ts:138-149`. The kernel validates the
registered handler names against the manifest — every declared action needs a
handler and no extras — so a mismatch fails registration rather than silently
half-working. Standalone (`npm run dev`, no bridge) registration is a **no-op**
and the in-app UI is unaffected.

| Action | Permission | Params | Behavior |
| --- | --- | --- | --- |
| `categorizeTransactions` | `actions.write` | `{ month? }` | Runs the categorizer; auto-applies high-confidence categories, routes the uncertain to Review. `month` is free text (`"February"`, `"Feb 2026"`, `"2026-02"`); omit for all months. Handler at `FinanceContext.tsx:110` |
| `findRecurring` | `actions.read` | — | Detects recurring charges and summarizes subscriptions, bills and monthly cost. Handler at `FinanceContext.tsx:124` |
| `buildBudgetFromHistory` | `actions.write` | — | Sizes a monthly budget per category from recent history + buffer. Handler at `FinanceContext.tsx:143` |

Month parsing lives in `src/orchestrator/month.ts` (13 unit tests — this is
where a day-parsed-as-year bug was fixed on 2026-06-23; do not hand-roll month
parsing elsewhere). The manifest also declares four `promptSuggestions` that the
OS surfaces as starter prompts.

**Worth recording: this needed ZERO ConjureOS-side change.** The action catalog
is generic — apps declare actions in their manifest, the store carries the
manifest through to install (#235, migrations 044/045), and the kernel's action
registry validates and dispatches. Adding three finance actions was purely an
app-side change. Any future anchor app gets the same for free.

**The categorization engine itself** (`src/orchestrator/`) runs entirely
client-side, so plaintext never reaches our server on this path. Per
transaction it predicts a category plus confidence; **≥ 0.85 auto-applies**
(status `auto`), anything lower goes to the Review queue (`needs_review`) with a
short human-readable reason. The inference engine is resolved at runtime in
priority order — **tier credits → group key → user's own key (BYK) → heuristic**
(`resolveCredential`, `src/orchestrator/index.ts:34-56`). The heuristic engine
needs no key and no network, so categorization **always works**; AI only
improves accuracy when budget or credentials exist
(`VITE_INFERENCE_PROVIDER=anthropic`). `setTierContext()`
(`orchestrator/index.ts:71`) is the hook ConjureOS uses to inject tier/group
allowances at runtime.

---

## The other four security layers (#387–#390)

`id: finance-security-layers`

Layer #4 (field encryption) shipped. The other four are **all still OPEN** —
verified against the ConjureOS issue tracker. They sit under umbrella issue
#268, milestone "Phase 36 — Security Hardening", and are documented in
`SECURITY_FIXES.md` → "Finance data security".

| # | Issue | Layer | Risk if absent | Status |
| --- | --- | --- | --- | --- |
| F1 | [#387](https://github.com/Jonny-B/ConjureOS/issues/387) | Protect the service-role key — lives only in edge functions, never in a client artifact or a log; rotatable; audited | The service-role key bypasses RLS; one leak = full cross-user dump | **OPEN** |
| F2 | [#388](https://github.com/Jonny-B/ConjureOS/issues/388) | RLS default-deny + **cross-user isolation tests** on every `finance.*` table | A loose policy silently exposes one user's bank data to another; an untested policy is an unproven policy | **OPEN** |
| F3 | [#389](https://github.com/Jonny-B/ConjureOS/issues/389) | Vault the Plaid access tokens with a **tested** `read_vault_secret` path | A DB read or backup leak hands over live bank access, not just stale rows | **OPEN** |
| F4 | — (no issue) | **Column-level field encryption** | Plaintext PII readable by anyone with a DB read | **SHIPPED** dev + prod, 2026-06-24 (PRs #396 → dev, #397 → main) |
| F5 | [#390](https://github.com/Jonny-B/ConjureOS/issues/390) | Hygiene — 2FA on Supabase + Plaid + GitHub, least-privilege tokens, "never log transaction/PII data" rule in the finance functions | Infra account takeover, over-scoped tokens, PII in logs | **OPEN** |

**Read F2 and F3 correctly: the mechanisms already exist; the *tests* are the
deliverable.** `035_finance_schema.sql` already enables RLS with own-row
policies on every table and already routes the access token through Vault.
F2/F3 are about **proving** that with automated regression tests that attempt a
cross-user read/update and assert failure, and a `read_vault_secret` round-trip
plus an assertion that a plain DB read never returns the token. The definition
of done for each layer is "a chokepoint enforcement **and** an automated
regression test" — the test, not the policy, is the artifact.

**Two adjacent open finance issues not in the five-layer table:**

- **[#326](https://github.com/Jonny-B/ConjureOS/issues/326)** (MAJOR) —
  `plaid-exchange` logs the full Plaid exchange response on an unexpected-shape
  edge case, which **may contain a live `access_token`**. Fix this before
  production Plaid credentials exist.
- **L4** in `SECURITY_FIXES.md` (low) — Plaid `error_message` is forwarded to
  the client verbatim (verbose; no credential echo observed).

**One known limitation, accepted:** account deletion cascade-deletes
`finance.*` rows but does **not** revoke the Plaid access token at Plaid — the
bank link lingers on Plaid's side until expiry (recorded in
`DECISIONS_ARCHIVE.md`, 2026-05-29 account-deletion entry). Revisit when
production Plaid is live; a stale prod link is a different risk from a stale
sandbox one.

---

## CI publishing — the gotcha that cost a session

`id: finance-ci-publishing`

**Symptom, if you hit it cold:** the finance repo's "Publish to ConjureOS App
Store" workflow fails with `Unable to resolve action … not found`, or (now)
`No existing store app found for slug "finance"`.

**Root cause #1 — private cross-repo composite actions are org-only.** The
build/publish logic is a composite action inside the **private** ConjureOS repo.
GitHub cannot resolve `uses: Jonny-B/ConjureOS/…@dev` from another **private
personal** repo — cross-repo private action sharing is an *organization*
feature, so the default `GITHUB_TOKEN` (scoped to the running repo) fails.

**The fix, already committed** (`c8a68e0`, "ci: fix publish workflow — clone
ConjureOS for the composite action"). `.github/workflows/publish-store.yml`
checks ConjureOS out into `.conjureos/` with a read-only PAT and runs the action
by **local path** (`uses: ./.conjureos/.github/actions/publish-anchor-app`).
That checkout also carries `scripts/`, whose `npm install` pulls the
`@conjureos/pack` bundler.

**What is still missing: the `CONJUREOS_REPO_TOKEN` secret on the finance
repo.** Create it as a fine-grained PAT: github.com → Settings → Developer
settings → **Fine-grained tokens** → Generate new token → Resource owner
`Jonny-B` → Repository access **Only select repositories → ConjureOS** →
Permissions → **Contents: Read-only**. Add it as `CONJUREOS_REPO_TOKEN` on
**each** anchor repo (a personal account has no org-level secrets). Rotate on
expiry. Full write-up: ConjureOS `ANCHOR_APP_CI_SETUP.md` §5.

Secrets the finance repo needs, in total:

| Secret | Value |
| --- | --- |
| `CONJUREOS_REPO_TOKEN` | read-only fine-grained PAT for ConjureOS — **not yet set** |
| `SUPABASE_DEV_PROJECT_REF` | dev project ref |
| `PUBLISH_BOT_DEV_PASSWORD` | dev bot publisher password |
| `SUPABASE_PROD_PROJECT_REF` | prod project ref |
| `PUBLISH_BOT_PROD_PASSWORD` | prod bot publisher password |

(The Supabase **anon** keys are inlined in the workflow on purpose — they are
public by design and RLS applies. A **service-role** key is never used by this
pipeline and must never appear in app code.)

**How the publishes actually happened instead: a service-role/OTP backdoor.**
Because CI could not run, both the `0.4.0` dev publish and the `0.5.3` dev+prod
publishes were done manually: build the single-file bundle
(`npm run build:inline` → `dist/index.html`), upload it to the `store-apps`
storage bucket, insert a `store_app_versions` row with an incremented
`version_number`, and point `store_apps.current_version_id` at it. The in-app
"update available" banner fires purely on
`current_version_number > installed_version_number` (`get_my_app_updates()`
RPC, pull-based, on sign-in or manual "Check for updates") — which is why the
prod users sitting on v3 saw "Update available — v5" without any
uninstall/reinstall.

**Root cause #2, new since the removal — the store row no longer exists.** The
finance workflow calls the action with `slug: finance`, and
`scripts/publish-app.mjs` resolves the row by slug; with no row it fails with
`No existing store app found for slug "finance"`. **The composite action has no
`--first-publish` support** (see its arg assembly,
`.github/actions/publish-anchor-app/action.yml:163-188`), so CI *cannot* create
the listing. Restarting requires one of:

- run `scripts/publish-app.mjs` **manually** with
  `--first-publish --slug finance --display-name "Conjure Finance" --icon 💰
  --visibility public [--tags finance] --html dist/index.html
  --package-json package.json` (the row is created **server-side** by the
  `store-version` Edge Function's `action:"create"` — direct `store_apps`
  inserts are blocked by migration 085), or
- publish once through the in-app App Store publish flow as the bot account, or
- add first-publish inputs to the composite action.

After the row exists, note `store-version`'s republish guards: it refuses a
publish whose content SHA is unchanged, and refuses an `app_version` that is not
**greater** than the currently published one. Bump `package.json`'s `version`
every time. (The action also enforces `package.json` version == `src/version.ts`
`APP_VERSION` when that file exists — finance does not use that convention, so
the check is skipped.)

**One more mismatch to be aware of:** the finance workflow still uses the older
`html-path: dist/index.html` (Vite `build:inline`) input. The current anchor-app
convention is `source-path:`, which builds with ConjureOS's own `@bundle`
(esbuild + jspm importmap) so the result is byte-identical to a user-imported
app. `html-path` is still supported, but finance is one of the last anchor apps
not yet "de-Vited". If you migrate it, follow what Recipes did — and re-read
`conjureos-app-recipes/CLAUDE.md`, which documents the traps (notably: the store
bundler has no `.json` loader).

---

## Known gaps and landmines

`id: finance-known-gaps`

Findings from reading the code as it stands. Each one would otherwise be
rediscovered painfully during a restart.

**1. The frontend has no client for the backend that actually shipped.**
`buildFinanceApi()`'s `synced` mode (`src/api/index.ts:28-41`) builds
`SyncedFinanceApi` over `HttpSyncTransport`, which speaks the **retired** E2E
`encrypted_records` wire contract (`src/api/sync/transport.ts`). The backend that
exists is the server-readable `finance.*` schema behind `finance-read` and the
`plaid-*` functions. **These two do not connect.** There is no adapter. This is
the largest single work item on resume, and the README's architecture diagram
will mislead you about it.

**2. `vault.unlock()` is never called, so `synced` mode is dormant anyway.**
There is no passphrase UI. Even the E2E path could not be used today.

**3. The app claims end-to-end encryption in three places, and it is not true of
the shipped backend.** `README.md` design-goal bullets, the sidebar badge at
`src/components/Layout.tsx:126`, and `src/components/Settings.tsx:88-92`. Fix
before any live data. This is a truthfulness issue, not a cosmetic one.

**4. `finance.delete_vault_secret` does not exist on dev or prod.**
`plaid-unlink/index.ts:117` calls `svc.rpc("delete_vault_secret", …)`, but the
migration that creates it — `036_finance_vault_delete.sql` — is **still parked
on the unmerged branch `claude/dev-branch-sync-deploy-Yjz2L`** and is absent
from both `dev` and `main`. The call is best-effort (it only `console.warn`s),
so unlinking still works, but **every unlink orphans a `vault.secrets` row
holding a real Plaid access token**. Ship the migration before production Plaid.
Related numbering hazard: migration **036 is reserved** for that file —
onboarding deliberately jumped 035 → 037 to avoid a ledger collision. Do not
reuse 036 for anything else, and expect to reconcile ordering when that branch
lands (Supabase's `db push` enforces remote-ledger = local-files).

**5. `transactions.user_category` is an encrypted column that nothing
encrypts.** Migration 088 encrypts it and `finance-read` decrypts it
(`finance-read/index.ts:104`), but `plaid-sync` never writes it — by design, it
is the **only** column an authenticated client may UPDATE directly
(`035_finance_schema.sql:161`, `grant update (user_category)`). A client writing
a plain category string there would store plaintext into an envelope column;
`decryptField` would then throw `unrecognized finance ciphertext envelope`, and
because `finance-read` **fails closed**, that single bad value would break the
entire read for that user. Decide one of: route recategorization through a new
encrypt-on-write edge function, revoke the direct column grant, or make decrypt
tolerate a legacy plaintext value. **Do not leave this ambiguous.**

**6. `finance.budgets` is not encrypted.** Budget `amount`s are plain
`numeric` and client-CRUD'd (`035:169-188`). That may be an acceptable
sensitivity call, but it is an *implicit* one — record the decision explicitly.

**7. `finance.recurring` is a server table nothing populates.** Recurring
detection is client-side in `src/analytics/recurring.ts`; the table
(`035:195-217`) was scaffolded for a server-side pass that was never written.
Either populate it or drop it, so nobody assumes it holds data.

**8. Docstring drift: three files say "migration 087" where they mean 088.**
`finance-read/index.ts:4`, `plaid-sync/index.ts:202` and `:308`. The actual
migration is `088_finance_field_encryption.sql`. Harmless, but it will send a
reader to the wrong file (087 is the Recipes rating migration).

**9. `fieldCrypto` has no test file in the repo.** `DECISIONS_ARCHIVE.md`
describes it as "unit-tested incl. the rotation window", but no test file
matching `fieldCrypto` exists anywhere in the ConjureOS tree today. Either the
tests were never committed or they were lost. **Write them before trusting a key
rotation** — the rotation window (an envelope written under `v1` decrypting via
`FINANCE_DEK_OLD` while `v2` is current) is exactly the behavior you want proven
before it runs against real data.

**10. No Plaid webhook receiver exists.** `plaid-sync`'s header comments
anticipate a webhook caller ("Webhook (future) when Plaid fires
`SYNC_UPDATES_AVAILABLE`"), but no function is wired to receive it. Today sync
only happens when a client calls it. Background alerts depend on this.

**11. `plaid-sync` caps a single call at `MAX_PAGES = 50`** (25k transactions)
and declares the cap at `plaid-sync/index.ts:252` and reports `fully_synced` at `:376`; the cursor is
persisted after **every** page, so re-running resumes safely. Also expect
`202 product_not_ready` on brand-new items while Plaid backfills history — the
client is meant to retry (`retry_after_ms: 2000`), not treat it as failure.

**12. Sign convention flips between client and server.** The client uses
negative = money out (`types.ts:10`); Plaid and therefore
`finance.transactions.amount` use positive = outflow
(`035:113-115`). Any adapter must flip. This is a classic
silent-wrong-numbers bug.

---

## Reference map

`id: finance-reference-map`

**Frontend — `Jonny-B/conjureos-finance`, branch `dev` @ `45653c1` (`0.5.3`)**

| Path | What |
| --- | --- |
| `STATUS.md` | The paused-state memo (owner-facing) |
| `src/App.tsx` | Routes; the `MemoryRouter` rationale |
| `src/components/Layout.tsx` | Responsive shell, nav definitions, alert→notify bridge |
| `src/api/contract.ts` | `FinanceApi` — the only surface the UI depends on |
| `src/api/types.ts` | Canonical domain model |
| `src/api/index.ts` | The mock/synced factory (`VITE_FINANCE_API`) |
| `src/api/mock/` | Deterministic multi-month seed + `MockFinanceApi` |
| `src/api/synced/`, `src/api/sync/`, `src/crypto/` | The retired E2E path (dormant) |
| `src/analytics/` | Recurring, net worth, budget suggest, alerts, date helpers |
| `src/orchestrator/` | Categorizer, month parsing, inference provider routing |
| `src/sync/bankProvider.ts` | `BankProvider` seam (`VITE_BANK_PROVIDER`) |
| `src/enrich/merchant.ts` | `MerchantEnricher` seam |
| `src/platform/host.ts` | ConjureOS bridge: SSO, whoami, notify, action registration |
| `src/store/FinanceContext.tsx` | App state + the three orchestrator action handlers |
| `.github/workflows/publish-store.yml` | Store publish (needs `CONJUREOS_REPO_TOKEN`) |
| `.env.example` | `VITE_FINANCE_API`, `VITE_SYNC_BASE_URL`, `VITE_INFERENCE_PROVIDER`, … |

**Backend — `Jonny-B/ConjureOS`**

| Path | What |
| --- | --- |
| `supabase/migrations/035_finance_schema.sql` | `finance.*` schema, RLS, grants, Vault wrappers |
| `supabase/migrations/088_finance_field_encryption.sql` | Sensitive columns → ciphertext `text` |
| `supabase/functions/_shared/fieldCrypto.ts` | AES-GCM keyring, encrypt/decrypt/decryptNumber |
| `supabase/functions/plaid-link-token/` | Create a Plaid Link token |
| `supabase/functions/plaid-exchange/` | public token → item; access token into Vault |
| `supabase/functions/plaid-sync/` | `/accounts/get` + `/transactions/sync`; encrypt on write |
| `supabase/functions/plaid-list-items/` | The caller's linked institutions |
| `supabase/functions/plaid-unlink/` | Plaid `/item/remove` + cascade delete + vault cleanup |
| `supabase/functions/finance-read/` | The decrypt-on-read chokepoint |
| `FINANCE_ENCRYPTION.md` | **The key runbook** — setup, rotation, recovery |
| `SECURITY_FIXES.md` | "Finance data security" — the five layers |
| `ANCHOR_APP_CI_SETUP.md` | Anchor-app publish pipeline, §5 = `CONJUREOS_REPO_TOKEN` |
| `DECISIONS_ARCHIVE.md` | 2026-05-28 (consolidation + server-readable model), 2026-06-24 (layer #4) |
| `STATUS_ARCHIVE.md` | 2026-06-23, 06-24, 06-24/25 finance entries (incl. the pause + removal) |
| `OPEN_QUESTIONS.md` | The parked prod-secrets reminder |
| `TROUBLESHOOTING.md:433` | The `Script error.` / `MemoryRouter` fix |

**Parked branches (unmerged, still valid work)**

- ConjureOS `claude/dev-branch-sync-deploy-Yjz2L` — migration
  `036_finance_vault_delete.sql` (the missing `delete_vault_secret` RPC) plus
  the sandbox test script.
- ConjureOS `claude/conjure-finance-app-4eLif` — `PHASE_FINANCE_DESIGN.md`
  (the keystone backend-bridge design doc), never merged, separate lineage.
- `conjureos-finance` `claude/mint-clone-app-VtqDi` — the preserved E2E
  prototype, kept in case a Plaid-free "manual entry" mode is ever wanted.
