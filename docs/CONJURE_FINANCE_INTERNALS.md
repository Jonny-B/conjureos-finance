# Conjure Finance — internals, decisions, and how to restart

> **READ THIS FIRST — the checkout you are probably sitting on is stale.**
> `/home/user/conjureos-finance` is on branch
> `claude/ai-integration-conjureos-16137t` at `0.4.0`. That is **not** the tip.
> The real state is `origin/dev` @ `45653c1` (`0.5.3`) — the only ref carrying
> `STATUS.md`. Run `git checkout dev && git pull` before reading any code.
>
> **Reference pins.** Frontend `src/…:line` references are against
> `conjureos-finance` **`origin/dev` @ `45653c1` (`0.5.3`)**. Backend and kernel
> references (`supabase/…`, `scripts/…`, `src/kernel/…`, `.github/…`) are against
> `ConjureOS` **`origin/dev` @ `72bbbdf`**, verified 2026-08-21. ConjureOS moves
> fast — its `dev` was at `0f971e5` a few hours before this pin — so if a line
> number misses, `git log -S'<the code>'` rather than assuming the doc is wrong.
>
> **Never put a key value in this file.** `FINANCE_DEK`, `PLAID_SECRET` and
> friends are named here, never reproduced. The prod `FINANCE_DEK` must never
> transit an AI session (standing project rule, `OPEN_QUESTIONS.md:37`).

## Porting this into the in-app "ConjureOS Internals" doc

`id: finance-porting-note`

**This is a working draft, and the port is NOT mechanical.** Do not budget it as
a copy-paste.

- **Target:** the `SECTIONS` array in
  `ConjureOS/supabase/functions/admin-docs/docs-content.ts`.
- **Entry schema** (`docs-content.ts:620`): `{ id, level, title, body }` where
  `level` is `1`–`3` for nav nesting and **`body` is JSX**, not markdown —
  `body: (<>…</>)` with `<p className="lead">`, `<h3>`, `<code>`, `<strong>`.
  Every heading below therefore needs hand conversion: markdown tables become
  `<table>`/`<ul>`, `**bold**` becomes `<strong>`, backticks become `<code>`,
  and `→` / `≥` must survive JSX escaping. This document also supplies no
  `level` values — pick them at port time (`1` for each top-level entry).
- **This is a MERGE, not an append.** A `finance-encryption` entry **already
  exists** at `docs-content.ts:992-1010` — a condensed version of the same
  material. Porting `finance-field-encryption` verbatim would ship two
  overlapping sections with near-identical titles. **Replace** the existing
  entry; do not add alongside it.
- **`admin-docs` is an edge function**, so per `ConjureOS/CLAUDE.md` §5 it ships
  in its **own commit** and redeploys via `supabase-functions.yml`. Do not bundle
  the docs change with client code.
- The `id:` line under each `##` heading below is the stable id; the heading text
  is the `title`; everything after is the `body` source.

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

**The one thing to know before planning a restart:** as a store-installed app,
Finance **cannot authenticate to its own backend**. The kernel returns `null`
instead of a JWT for any app not in `DEFAULT_APPS`, and `finance` is not one.
That is a ConjureOS-side architecture decision, not app work, and it gates
everything to do with live data. See `finance-known-gaps` item 1 and
`finance-restart-checklist` step 5.

**Where things physically are:**

| Thing | Location |
| --- | --- |
| Frontend | `Jonny-B/conjureos-finance`, integration branch `dev` (tip `45653c1`, `0.5.3`) |
| Finance schema | ConjureOS `supabase/migrations/035_finance_schema.sql` |
| Field encryption | ConjureOS `supabase/migrations/088_finance_field_encryption.sql` + `supabase/functions/_shared/fieldCrypto.ts` |
| Edge functions | ConjureOS `supabase/functions/{plaid-link-token,plaid-exchange,plaid-sync,plaid-list-items,plaid-unlink,finance-read}/` |
| Key runbook | ConjureOS `FINANCE_ENCRYPTION.md` |
| Security backlog | ConjureOS `SECURITY_FIXES.md` → "Finance data security" (**stale on F4**, see `finance-security-layers`); `PHASE_36_DESIGN.md`; issues #387–#390 |
| Frontend status memo | `conjureos-finance/STATUS.md` |
| Port target for this doc | ConjureOS `supabase/functions/admin-docs/docs-content.ts` |

---
## Why development was paused

`id: finance-why-paused`

**Date: 2026-06-25. Reason: priority, not failure.** Nothing about Finance broke.
The owner shifted attention to the ConjureOS platform itself and to the Recipes
anchor app, and Finance was the cheapest thing to put down because **its next
increment was blocked on something outside the codebase anyway** (see
`finance-blocked-on-llc`).

The reasoning, from `ConjureOS/STATUS_ARCHIVE.md` (2026-06-24/25 entry) and
`conjureos-finance/STATUS.md`:

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
4. *(Inference by this document, not in the project record.)* Leaving it
   published had ongoing cost: a store-listed app showing fabricated
   transactions invites bug reports and support load, and risks reading as a
   real finance product. Pulling it removed that surface for the duration of the
   pause. Reasons 1–3 are recorded; treat this one as commentary.

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
each at the time (2026-06-25, `ConjureOS/STATUS_ARCHIVE.md`):**

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

### Re-verify before you plan around it — *idempotent, read-only*

The "0 rows" claim is a 2026-06-25 snapshot. Confirm it is still true on **each**
project before assuming a first publish is needed. Supabase Dashboard → SQL
Editor → New query → paste → Run, once against dev
(`mqpvjlsywrptefgwuztn`) and once against prod (`ntgelbtepecqsqloxmct`):

```sql
-- 1. The listing itself. Expect 0.
select count(*) from public.store_apps where slug = 'finance';

-- 2. Versions + installs, joined through the row (they cascade, so a non-zero
--    here with a zero above would mean something is very wrong). Expect 0, 0.
select
  (select count(*) from public.store_app_versions v
     join public.store_apps a on a.id = v.store_app_id where a.slug = 'finance') as versions,
  (select count(*) from public.store_app_installs i
     join public.store_apps a on a.id = i.store_app_id where a.slug = 'finance') as installs;
```

Expected output: `count | 0`, then `versions | 0`, `installs | 0`. A non-zero
first count means the row was re-created (someone already re-published) — in
that case ship a **normal version bump**, not a first publish.

> **Correction to a plausible-looking check.** You cannot find the finance
> storage objects by slug. Store HTML is uploaded under
> `{uploaderId}/{appId}/{uuid}.html` (`scripts/publish-app.mjs:268`) or
> `{uploaderId}/{uuid}.html` on a first publish (`:300`) — **the slug never
> appears in the storage key**, so a query like
> `storage.objects … where name like 'finance/%'` returns 0 whether or not the
> files exist, and proves nothing. With the rows gone, no pointer to those
> objects survives; any leftover is an unreferenced orphan. The only meaningful
> check is bucket-wide, and it is not finance-specific:
>
> ```sql
> -- Orphaned store bundles across ALL apps (no version row points at them).
> select count(*) from storage.objects o
> where o.bucket_id = 'store-apps'
>   and not exists (
>     select 1 from public.store_app_versions v where v.html_storage_key = o.name
>   )
>   and not exists (
>     select 1 from public.store_apps sa where sa.html_storage_key = o.name
>   );
> ```
>
> Both exclusions are needed: `store_app_versions.html_storage_key`
> (`032_app_versioning.sql:36`) holds the raw `storage.objects.name` — that is
> exactly how `023_store_apps_storage_visibility.sql:31` joins them — **and**
> `public.store_apps` carries its own `html_storage_key` (`005_app_store.sql:24`,
> still rewritten by rollback at `032:285`). Omitting the second produces false
> positives.
>
> A non-zero result is a general housekeeping finding, not evidence about
> Finance. Treat the storage half of the original "verified 0" claim as
> unverifiable after the fact, and harmless either way — an orphaned object is
> unreachable without a row pointing at it.

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
  (**31 tests**, per `STATUS.md`). `npm run typecheck` is `tsc -b --noEmit`.
  Both were green at
  `0.5.3`.

---

## What is blocked, and on what

`id: finance-blocked-on-llc`

**Two independent blockers.** Everyone remembers the LLC; the second one is the
quiet killer and is described in full in `finance-known-gaps` item 1.

1. **Real Plaid data requires the LLC** (external, owner-owned).
2. **The app cannot authenticate to its own backend** (internal, ConjureOS
   kernel work). Even with Plaid credentials in hand, `finance-read` and the
   `plaid-*` functions 401 a store-installed app, because the kernel refuses to
   hand it a JWT.

### Blocker 1 — the LLC. **The evidence says it may already be resolved.**

**Do not assume this blocker still stands.** It was recorded on 2026-06-24, and
the repo has moved since. Check before you plan around it.

**What the entity is, and what the record says.** The blocker is that Plaid
production access is granted to a **legal entity**. The entity being formed is
an **Ohio LLC, `ConjureOS LLC`** — `ConjureOS/STATUS_ARCHIVE.md:15` and again at
`:83` record, verbatim, "Owner in-progress: Ohio LLC `ConjureOS LLC` filing."
`DECISIONS_ARCHIVE.md:107` gates the legal feature flag on the same thing ("LLC
+ DMCA agent + NCMEC + counsel done").

**And the entity name is already in the shipped legal pages.** All five of
`public/{terms,privacy,refund,dmca,report}.html` on `ConjureOS origin/dev`
contain the literal string **"ConjureOS LLC"** — e.g. `public/terms.html:5`,
"ConjureOS LLC — the legal name operating ConjureOS". The `LEGAL_ACTIVATION.md`
step-1 placeholders `[Legal Entity]` and `[Jurisdiction]` are **gone**:

```
# In the ConjureOS checkout (make sure you are on origin/dev — see step 1).
grep -rnE '\[(Legal Entity|Jurisdiction)\]' public/
```

*Idempotent, read-only.* **This returns ZERO matches today** — verified against
`origin/dev` @ `72bbbdf`. Only `[Effective Date]` remains outstanding (in
`terms`, `privacy`, `refund`, `dmca`).

**What that does and does not prove.** It is good evidence the **entity landed**.
It is **not** evidence that **Plaid production access was granted** — those are
two separate steps, and the second one leaves no trace in this repo at all. The
only thing tracked in-repo is the *consequence* of the unblock:
`ConjureOS/OPEN_QUESTIONS.md:35-41` ("Set prod finance secrets when Plaid goes
live (after the LLC clears)").

**So: ask the owner two questions, in this order.**

1. **Did the Ohio `ConjureOS LLC` filing complete?** (Evidence says probably yes.)
2. **Has a Plaid production-access request been submitted or granted?** The
   concrete step is a **production-access request with company verification**
   (legal name, entity details, use-case description) from the Plaid dashboard,
   upgrading the account off Sandbox. Nothing in either repo can advance it.

If both are yes, blocker 1 is **clear** and the work is the prod-secrets runbook
(`finance-restart-checklist` step 3). Blocker 2 — the auth gate — stands
regardless and is unaffected by any of this.

### Consequences of blocker 1, stated exactly

- **Dev is wired to the Plaid *sandbox*.** On the dev Supabase project
  (`mqpvjlsywrptefgwuztn`) the finance edge-function secrets **are set**:
  `FINANCE_DEK`, `FINANCE_DEK_ID=v1`, `PLAID_CLIENT_ID`, `PLAID_SECRET`,
  `PLAID_ENV=sandbox`. Dev finance functions are live against Plaid sandbox.
- **Prod is deliberately dormant.** On the prod project
  (`ntgelbtepecqsqloxmct`) the functions are **deployed** and migration 088 is
  **applied**, but `FINANCE_DEK` and `PLAID_*` are **not set**. Any call throws
  `FINANCE_DEK is not set on this function` (`_shared/fieldCrypto.ts:71`) or
  returns `503 plaid_not_configured` (`plaid-sync/index.ts:124-128`). **This is
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

### Consequences of blocker 2

The frontend has no client for the backend that shipped **and** no way to
authenticate to it if it had one. Both halves are in `finance-known-gaps`
items 1 and 2, and step 5 of `finance-restart-checklist` is where the decision
gets made. Plaid access alone will not light the app up.

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
  an explicit comment so nobody re-adds them by accident (`Layout.tsx:51`:
  "Goals + Credit Score are intentionally **absent**"; `More.tsx:26`:
  "…intentionally **omitted**").
- **Deliberately NOT removed:** the *data layer*. `SavingsGoal`
  (`src/api/types.ts:55-61`), the `savings_goal` `RecordKind`
  (`src/api/sync/transport.ts:20`), `listSavingsGoals` /`upsertSavingsGoal` /
  `deleteSavingsGoal` on the API contract (`src/api/contract.ts:85-87`), their
  mock implementations (`src/api/mock/mockApi.ts:162-182`), the synced-path
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

In dependency order. Steps 1–2 orient; **step 5 is a hard gate — nothing
downstream works until it is decided**; step 9 is last. Every step is tagged
*idempotent* or *destructive* per `ConjureOS/CLAUDE.md` → "Runbook contract".

**1. Reorient — *idempotent, read-only*.** Read, in order:
`conjureos-finance/STATUS.md`, this document, ConjureOS `FINANCE_ENCRYPTION.md`,
ConjureOS `SECURITY_FIXES.md` → "Finance data security" (**note: stale on F4**),
ConjureOS `PHASE_36_DESIGN.md` → "Finance data security".

```
cd /home/user/conjureos-finance && git checkout dev && git pull
node -p "require('./package.json').version"

# BOTH repos are off origin/dev. The ConjureOS checkout is on a feature branch
# that is NOT an ancestor of dev (dozens of files differ, including
# kernel/defaultApps.ts and admin-docs/docs-content.ts).
cd /home/user/ConjureOS && git fetch && git checkout dev && git pull
git rev-parse --short HEAD
```
Expected output: `Switched to branch 'dev'` (or `Already on 'dev'`) and
`0.5.3` or later for finance. If it prints `0.4.0` you are still on the stale
branch and every file you read will be wrong. For ConjureOS, expect a SHA at or
after `72bbbdf` — every backend line number in this document is pinned there.
Reading the backend from the feature branch will silently give you different
files.

**2. Confirm the app still builds and passes — *idempotent*.**

```
npm ci
npm run typecheck
npm test
npm run build:inline
```
Expected output: `npm ci` ends with `added N packages`; `npm run typecheck`
prints **nothing** and exits 0 (a `tsc -b --noEmit` success is silent);
`npm test` ends with a vitest summary — `Test Files  4 passed (4)` and
`Tests  31 passed (31)` (31 tests across four suite files, per `STATUS.md`);
`build:inline` ends with `✓ built in <n>s` and writes `dist/index.html`. Any
`error TS…` line or a non-zero exit is a real failure.

Then **open `dist/index.html` directly in a browser** and confirm it renders
with a clean console. That single self-contained file is what the store ingests;
`npm run dev` will not surface a bundle-only crash.

**3. Set the prod secrets — owner-only, *destructive if done wrong*.** Follow
`FINANCE_ENCRYPTION.md` → "Initial setup" exactly. Generate a **fresh** prod
`FINANCE_DEK`, back it up in a password manager **first**, then set
`FINANCE_DEK`, `FINANCE_DEK_ID=v1`, production `PLAID_CLIENT_ID` /
`PLAID_SECRET`, `PLAID_ENV=production` on the prod project. Expected output:
`Finished supabase secrets set.`

**Then REDEPLOY the finance functions** (or wait for the isolates to recycle).
`FINANCE_ENCRYPTION.md:57-58` says no redeploy is needed; **do not believe it**
— its own rotation steps redeploy (`:120`, `:140`), and the code explains why:
`fieldCrypto.ts:66-89` memoizes the keyring in a module-level `keyringPromise`,
and the promise is assigned **before** it can reject (`:69`), so a **failed**
keyring is cached for the isolate's entire life. Prod has no key today, so the
sequence a restarter actually hits is: call the function → rejection cached →
`supabase secrets set` → call again → **the same `FINANCE_DEK is not set` error
from the warm isolate, with the secret correctly set**. It looks exactly like
"the secret didn't take". It did; the isolate is stale. Redeploy.

**Do this yourself; the prod key must never transit an AI session.**
The destructive edge: overwriting an existing `FINANCE_DEK` after real rows have
been written makes every one of them permanently unreadable. Setting it on a
project that has never written a finance row is safe and rerunnable.

**4. Close the backend gaps before pointing the app at live data — *idempotent*
(migrations are additive).** Detail in `finance-known-gaps` items 5 and 6:
   - ship a migration adding `finance.delete_vault_secret` (currently missing on
     both projects — `plaid-unlink` calls an RPC that does not exist). The body
     already exists on the parked branch as `036_finance_vault_delete.sql`;
     **do not reuse number 036 for anything else**;
   - decide and implement how `finance.transactions.user_category` gets
     encrypted, or revoke the direct column grant;
   - land the Plaid webhook → `plaid-sync` path if background refresh matters.

**5. GATE — decide how the app authenticates to `finance-read`.** *Design
decision, no command.* This is ConjureOS kernel work, in the **other** repo, and
**every later step depends on it.** As a store-installed app, Finance gets
`null` instead of a token: `src/kernel/index.ts:1967` returns
`{ ok: true, result: null }` for any app whose path is not in
`BUILT_IN_APP_PATHS`, which is derived from `DEFAULT_APPS`
(`src/kernel/index.ts:99-101`) — and `finance` is not a default app. Meanwhile
every finance function requires a caller JWT (`finance-read/index.ts:41-51`,
`plaid-sync/index.ts:109-112`). Three options:

   - **(a) Make Finance a built-in.** Add it to `DEFAULT_APPS`. Cheapest to
     implement, but it changes the app's distribution model *and* its security
     posture: built-ins receive the raw user Supabase JWT, which is gated for
     exactly this reason (`SECURITY.md` invariants I1/I2, `PHASE_36_DESIGN.md` V1).
   - **(b) Mint a scoped token — the precedent already exists.** `recipes-db`
     solves this problem today: the kernel mints a short-lived ConjureOS token
     (`mint-app-token`, `sub` = user id, `aud` = the function origin), the app
     forwards it as a bearer, and the function verifies it against the
     `mint-app-token` JWKS and runs as service role with ownership enforced
     in-process; it is deployed `verify_jwt = false` because the minted token is
     not a Supabase JWT (`supabase/functions/recipes-db/index.ts:1-21`). Applying
     the same Phase 16c pattern to `finance-read` keeps Finance a normal store
     app and never hands it the user's Supabase session, and it is the sanctioned
     route: `PHASE_36_DESIGN.md:47` (invariant I2) explicitly blesses
     audience-scoped minted tokens as how apps reach a backend. **This is the
     option to evaluate first — but price it honestly.**

     **What it costs.** `recipes-db` runs `verify_jwt = false` and executes as the
     **service role**, with ownership enforced in application code by
     `creator_id` (`recipes-db/index.ts:9-10`, `:19-21`). Adopting that shape for
     `finance-read` **gives up the property this doc advertises as a security
     feature two sections up** — that it reads "only their rows through an
     RLS-scoped anon client, no `service_role`" (`finance-read/index.ts:44-48`).
     Per-user isolation would move from Postgres RLS to a hand-written
     `eq("user_id", sub)`, in the one function that decrypts bank data. That is
     an acceptable trade, but it is a **real change to security layer F2** and
     must be recorded in `DECISIONS.md`, not inherited by accident.
   - **(c) Proxy finance reads through a host bridge** so the app never holds a
     token at all. Most work, strongest isolation.

   Record the choice in `DECISIONS.md` before writing code.

**6. Write the live `FinanceApi` implementation — *idempotent*, and only after
step 5.** Build a `RestFinanceApi` that maps `finance-read`'s
`{accounts, transactions}` onto `src/api/types.ts`, wire it into the factory at
`src/api/index.ts:28-42` behind a third mode, and fill in `PlaidBankProvider`
(`src/sync/bankProvider.ts:92-109`) against `plaid-link-token` →
`plaid-exchange` → `plaid-sync` → `plaid-unlink`. **Mind both unit conversions**
— sign *and* scale, see `finance-known-gaps` item 15.

**7. Fix the stale end-to-end-encryption messaging — *idempotent*.** **Five**
surfaces claim the server cannot read your data: `README.md` design-goal
bullets, the sidebar badge at `src/components/Layout.tsx:126`, **two** separate
lines in `src/components/Settings.tsx:87-94` (the `Encryption` line and the
`What the server stores` line plus its paragraph), and `.env.example:3`. True of the mock and of
the abandoned E2E prototype; **not** true of the Plaid path that shipped. Fix
before any user sees live data — an inaccurate privacy claim is a liability, not
a cosmetic bug.

**8. Re-verify the store is still empty — *idempotent, read-only*.** Run the SQL
in `finance-store-removal` on **each** project. It decides whether step 9 is a
first publish or a normal version bump.

**9. Re-publish — *destructive on success, then refuses to rerun*.** The
`store_apps` row was deleted, so the existing CI workflow fails with
`No existing store app found for slug "finance"`. Full runbook, including the
env block, working directory, dry run and expected success line, in
`finance-ci-publishing`. Two prerequisites CI needs and does not have:

- Set the **`CONJUREOS_REPO_TOKEN`** secret on the finance repo — never added.
- **Fix the changelog step first (`conjureos-finance#14`).** This step promises
  "a published Release ships to prod"; today that path inlines the release body
  into a `run:` block (`publish-store.yml:69-73`), so it is a script injection
  *and* it crashes on an ordinary backtick. Copy the recipes/fitness `env:`
  form — `finance-ci-publishing` root cause #3 has it verbatim. Until then,
  prefer the `workflow_dispatch` (dev) path and treat release→prod as broken.

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
`src/api/index.ts:28-42`, driven by `VITE_FINANCE_API` (`mock` | `synced`,
default `mock`).

> **Read this before trusting the diagram.** The `synced` branch targets the
> **abandoned** end-to-end-encrypted `encrypted_records` backend, which is not
> what got built. `HttpSyncTransport` (`src/api/sync/httpTransport.ts:24`, calls
> at `:54-60`) POSTs to `sync-pull` / `sync-push` on the **retired
> conjureos-finance-backend project** — two endpoints that exist nowhere, on a
> project that no longer exists. It is also dormant regardless
> (`vault.unlock()` is never called — there is no passphrase UI), so today the
> app is mock-only in practice. See `finance-known-gaps` items 2 and 3.

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

- `auth.getUser` / `auth.getAccessToken` — **built-in/default apps only, which
  Finance is NOT.** For any app whose path is not in `BUILT_IN_APP_PATHS`, the
  kernel returns `null` rather than a token (`ConjureOS/src/kernel/index.ts:1967`,
  set derived from `DEFAULT_APPS` at `:99-101`). `finance` is a store-installed
  app at `/apps/finance`, so `getHostAccessToken` (`host.ts:90-98`) — which
  `src/api/index.ts:37` wires in as the synced path's token source — **always
  resolves to null in production.** Every finance edge function requires that
  token, so **Finance cannot currently talk to its own backend at all**. This is
  the restart's hard gate: `finance-known-gaps` item 1 and
  `finance-restart-checklist` step 5.
- `auth.whoami()` — the Phase-30g safe identity subset granted to *all* apps
  (`signedIn`, `email`, `persona`, `isAdmin`), ungated at
  `kernel/index.ts:1942-1959`. Drives the sidebar user badge — which is why
  identity works today while data access would not.
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

**Server-side shape is different, and post-088 the column *types* are different
too.** The `finance.*` schema (`035_finance_schema.sql`) mirrors Plaid, not the
app: `plaid_items` (one row per linked institution, with an
`access_token_vault_id` uuid pointer, never the token), `accounts`,
`transactions`, `budgets`, `recurring`. Read the types carefully before writing
an adapter — this is where money silently comes out wrong:

- **`finance.transactions`** — `amount`, `merchant_name`, `name`,
  `category_primary`, `category_detailed`, `user_category` are **`text`
  ciphertext envelopes** since migration `088` (`088:23-55`, column comments at
  `:57-66`), *not* the `numeric(18,2)` / `text` the original `035` declared.
  Same for **`finance.accounts`** `name`, `official_name`, `current_balance`,
  `available_balance`. You cannot read or aggregate these in SQL.
- **Still `numeric(18,2)`:** only `budgets.amount` (`035:173`) and
  `recurring.average_amount` (`035:200`).
- **On the wire**, `finance-read` hands back **decrypted numbers** via
  `decryptNumber` (`fieldCrypto.ts:133-136`) — a decimal count of **currency
  units** (dollars), because that is what Plaid sent and what was encrypted.
  The client's `Cents` is an **integer of cents** with the **opposite sign**.
  An adapter therefore needs `-Math.round(plaidAmount * 100)`: a sign flip
  **and** a scale change. Getting one and missing the other produces plausible,
  wrong numbers.

Mapping between the two models is exactly the work item in
`finance-restart-checklist` step 6.

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
3. **(F4) Sensitive columns are ciphertext at rest** — this section.

Those are layers F2, F3 and F4 of the five in `finance-security-layers`; F1
(service-role-key hygiene) and F5 (2FA / least privilege / no-PII-logs) are the
other two. Five total, not seven.

**The two encryption layers have different custodians, and the arguments do not
transfer.** Layer F4's key (`FINANCE_DEK`) lives in the edge-function secret
store and **never in the database**, which is what makes a stolen DB dump
useless on its own. Layer F3's Vault-held Plaid token is encrypted by a
**Supabase-managed root key** instead — strong, but a different trust model. Do
not repeat "the key is not in the database" about the vaulted token; it is not
the same claim.

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
- **Deliberately plaintext, within those two tables:** ids, `plaid_*_id`,
  `posted_at`/`authorized_at`, `iso_currency_code`, `pending`,
  `payment_channel`, account `mask` (last 4), `type`/`subtype` — needed for sync,
  sorting and range queries, and low sensitivity.
- **NOT ENCRYPTED AT ALL — two entire tables.** Migration 088 touches only
  `transactions` and `accounts` (`088:29-38`). The other two `finance.*` tables
  holding user data are fully plaintext, and a reader whose question is "what
  would a stolen dump expose?" needs to see them here rather than infer their
  absence:
  - **`finance.budgets`** — `category` (`035:172`) and `amount numeric(18,2)`
    (`035:173`), with full client CRUD (`035:188`). **A stolen dump yields the
    user's category-by-category budget profile in the clear** — how much they
    intend to spend on what. That is a behavioural profile, and it is exposed
    today.
  - **`finance.recurring`** — `merchant_name text` **in plaintext** (`035:199`)
    and `average_amount numeric(18,2)` (`035:200`). `merchant_name` is *the same
    data class the whole encryption layer exists to protect*. Nothing populates
    this table today (see `finance-known-gaps` item 8), so nothing leaks from it
    yet — but **whoever closes that gap by populating it will silently write
    plaintext merchant names beside encrypted ones.** Decide the encryption
    question *before* populating, not after.
- **One structural leak, for completeness:** AES-GCM is unpadded, so ciphertext
  length reveals plaintext length — the digit count of an amount, the character
  count of a merchant name — in exactly the offline-dump scenario this layer
  defends against. Minor next to the two plaintext tables, but real.
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

**Two traps the runbook does not flag, both in its middle step.**

1. **Step 3 has no tool — it is pseudocode.** `FINANCE_ENCRYPTION.md:143-171` is
   headed "Re-encrypt script (step 3)" and its body literally says
   "*Pseudocode of the loop*". No `finance-reencrypt.mjs` exists anywhere in the
   repo. **You will write it**, and you must add pagination the sketch omits —
   its `select` (`FINANCE_ENCRYPTION.md:161`) is unpaginated, so PostgREST's
   default 1000-row cap would silently re-encrypt only the first page. Step 4's
   `like 'v1.%'` verify is the only thing that would catch that, which is why
   step 4 is non-negotiable.
2. **Fix gap 6 first, or the loop dies part-way.** The pseudocode decrypts
   `user_category` (`FINANCE_ENCRYPTION.md:157`) — the one column a client can
   write plaintext into (`finance-known-gaps` item 6). A single plaintext value
   throws mid-run, leaving rows split across two keys.

**One more consequence of the memoized keyring** (`fieldCrypto.ts:66-89`, see
`finance-restart-checklist` step 3): after rotation step 2 promotes the new key,
a **warm isolate keeps encrypting under the old one** until it recycles. Those
rows are readable right up until step 5 drops `FINANCE_DEK_OLD` — and then they
are not. **Redeploy after step 2**, exactly as the runbook's own
`# redeploy` comments say, and re-run the step-4 verify immediately before
step 5.

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

Layer #4 (field encryption) shipped. The other four are **still open**. They sit
under umbrella issue #268, milestone "Phase 36 — Security Hardening", designed in
`PHASE_36_DESIGN.md` → "Finance data security" and tabled in `SECURITY_FIXES.md`.

> **`SECURITY_FIXES.md` is stale where it matters most.** At `:95` it still
> lists **F4 as "IN PROGRESS (separate worker)"**; F4 in fact **shipped to dev
> and prod on 2026-06-24** (PRs #396 → dev, #397 → main;
> `STATUS_ARCHIVE.md` 2026-06-24). The file's other rows (F1/F2/F3/F5 = OPEN)
> are accurate. Read it, but correct F4 in your head — or fix the file.

| # | Issue | Layer | Risk if absent | Status |
| --- | --- | --- | --- | --- |
| F1 | [#387](https://github.com/Jonny-B/ConjureOS/issues/387) | Protect the service-role key — lives only in edge functions, never in a client artifact or a log; rotatable; audited | The service-role key bypasses RLS; one leak = full cross-user dump | **OPEN** |
| F2 | [#388](https://github.com/Jonny-B/ConjureOS/issues/388) | RLS default-deny + **cross-user isolation tests** on every `finance.*` table | A loose policy silently exposes one user's bank data to another; an untested policy is an unproven policy | **OPEN** |
| F3 | [#389](https://github.com/Jonny-B/ConjureOS/issues/389) | Vault the Plaid access tokens with a **tested** `read_vault_secret` path | A DB read or backup leak hands over live bank access, not just stale rows | **OPEN** |
| F4 | — (no issue) | **Column-level field encryption** | Plaintext PII readable by anyone with a DB read | **SHIPPED** dev + prod, 2026-06-24 |
| F5 | [#390](https://github.com/Jonny-B/ConjureOS/issues/390) | Hygiene — 2FA on Supabase + Plaid + GitHub, least-privilege tokens, "never log transaction/PII data" rule in the finance functions | Infra account takeover, over-scoped tokens, PII in logs | **OPEN** |

**Read F2 and F3 correctly: the mechanisms already exist; the *tests* are the
deliverable.** `035_finance_schema.sql` already enables RLS with own-row
policies on every table and already routes the access token through Vault.
F2/F3 are about **proving** that with automated regression tests that attempt a
cross-user read/update and assert failure, and a `read_vault_secret` round-trip
plus an assertion that a plain DB read never returns the token. The definition
of done for each layer is "a chokepoint enforcement **and** an automated
regression test" — the test, not the policy, is the artifact.

### Issue #326 — the code is fixed; the ISSUE is stale

**This entry previously claimed a live vulnerability. It was wrong, and the
correction is worth stating loudly because of how the error happened: it was
sourced from the issue tracker rather than from the code.** In a security
section, verify against source. Always.

[#326](https://github.com/Jonny-B/ConjureOS/issues/326) says `plaid-exchange`
logs the full Plaid exchange response on an unexpected-shape edge case, which
could carry a live `access_token`. **The code already does exactly what the
issue's own remediation asked for** (guard at `:131`, safe log at `:132-140`),
on both `origin/dev` and `origin/main`:

```
// plaid-exchange/index.ts:132-140
// Audit #326: never log the raw `exchange` object — a partially-unexpected
// shape can still carry a live access_token (a banking credential). Log only
// safe scalars about its shape.
console.error("[plaid-exchange] unexpected Plaid response shape", {
  keys: Object.keys(exchange ?? {}),
  hasAccessToken: typeof accessToken === "string",
  hasItemId: typeof plaidItemId === "string",
});
```

Every other log site in that function logs a code/message or an
`error.message` only (`:76`, `:125`, `:163`, `:181`, `:198`) — no token, no raw
Plaid body.

**The outstanding action is therefore clerical, not engineering: close #326.**
Note before closing that the issue body also carries an **unrelated** functional
finding — `claimUsername` silently no-ops for non-admins — which is **not**
fixed and should be split into its own issue.

> **Verify that one from source too, not from the issue.** `claimUsername` is
> `src/platform/userProfile.ts:456-485` on the pinned tree (the bare
> `.update({ username }).eq("user_id", …)` is `:474-477`); the issue body's
> `:491` is a June-vintage number that no longer points at the function. The
> **substance holds**, and here is the independent evidence so the next reader
> need not trust #326 either: across every migration touching `user_profiles`,
> the only UPDATE policy is `007_admin.sql:82` `"admins update profiles"`. There
> is no self-update policy, so a non-admin's claim filters to **zero rows** and
> returns a false success. *(This doc previously carried the stale `:491` —
> exactly the failure it warns about, one layer down. Re-derive line numbers,
> not just claims.)*

**Also still open:** `SECURITY_FIXES.md` **L4** (low) — Plaid `error_message` is
forwarded to the client verbatim (verbose; no credential echo observed):
`plaid-sync/index.ts:195` and `:279`, `plaid-exchange/index.ts:124`.

**One known limitation, and it was an explicit owner choice, not an oversight:**
account deletion cascade-deletes `finance.*` rows but does **not** revoke the
Plaid access token at Plaid — the owner **opted out** of Plaid-unlink-on-delete
(`DECISIONS_ARCHIVE.md`, 2026-05-29). The bank link lingers on Plaid's side until
expiry. Revisit when production Plaid is live; a stale prod link is a different
risk from a stale sandbox one.

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

Secrets the finance repo needs:

| Secret | Value |
| --- | --- |
| `CONJUREOS_REPO_TOKEN` | read-only fine-grained PAT for ConjureOS — **not yet set** |
| `SUPABASE_DEV_PROJECT_REF` | dev project ref |
| `PUBLISH_BOT_DEV_PASSWORD` | dev bot publisher password |
| `SUPABASE_PROD_PROJECT_REF` | prod project ref |
| `PUBLISH_BOT_PROD_PASSWORD` | prod bot publisher password |

Two values the pipeline also needs are **inlined in the workflow, not secrets**,
and are public by design: the per-project Supabase **anon** keys, and the bot
identity `bot-email: conjureosbot@gmail.com`. A **service-role** key is never
used by this pipeline and must never appear in app code.

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
`scripts/publish-app.mjs` resolves the row by slug; with no row it fails at
`publish-app.mjs:426-430` with `No existing store app found for slug "finance".
Run the one-time bootstrap with --first-publish`. **The composite action has no
`--first-publish` support** (see its arg assembly,
`.github/actions/publish-anchor-app/action.yml:163-188`), so **CI cannot create
the listing**. Direct `store_apps` INSERT is blocked by
`085_store_apps_publish_authority.sql:32-36`; the row is created server-side by
the `store-version` Edge Function's `action:"create"`.

**Root cause #3 — the release→prod path is unreliable AND is a shell injection
(`conjureos-finance#14`, open, labeled `security`/`ci`).** The "Resolve
changelog" step interpolates user-controlled text **into the script body** of a
`run:` block:

```yaml
# .github/workflows/publish-store.yml:65-74
- name: Resolve changelog
  id: changelog
  run: |
    if [ "${{ github.event_name }}" = "release" ]; then
      text="${{ github.event.release.body }}"                     # :69
      [ -z "$text" ] && text="${{ github.event.release.name }}"    # :70
      [ -z "$text" ] && text="${{ github.event.release.tag_name }}"# :71
    else
      text="${{ github.event.inputs.changelog }}"                 # :73
```

`${{ }}` is substituted before the shell ever runs, so a release body is
**shell source** on a runner holding `CONJUREOS_REPO_TOKEN` and the publish
credentials. Two consequences, and the second is the one you will hit first:

1. **Injection.** GitHub's textbook script-injection pattern.
2. **It simply breaks.** Any ordinary changelog containing a backtick, `"` or
   `$` crashes the job. Recipes hit this for real — its workflow now carries the
   comment that a release body reading *"I made this"* failed with
   `made: command not found`.

**This invalidates the release→prod promise made in
`finance-restart-checklist` step 9 and in step 4 of the bootstrap runbook
below.** Fix it before relying on either.

**The fix already exists twice — copy it verbatim.** Both sibling anchor repos
pass the user-controlled fields as **environment variables** and read them as
`$VAR`, which is injection-safe:

```yaml
# conjureos-app-recipes/.github/workflows/publish-store.yml:44-56
  env:
    REL_BODY: ${{ github.event.release.body }}
    REL_NAME: ${{ github.event.release.name }}
    REL_TAG: ${{ github.event.release.tag_name }}
    DISPATCH_CHANGELOG: ${{ github.event.inputs.changelog }}
  run: |
    if [ "${{ github.event_name }}" = "release" ]; then
      text="$REL_BODY"
      [ -z "$text" ] && text="$REL_NAME"
      [ -z "$text" ] && text="$REL_TAG"
    else
      text="$DISPATCH_CHANGELOG"
    fi
```

`conjureos-fitness` took the same fix (DECISIONS 2026-06-21). Finance never got
it.

### First-publish bootstrap runbook

Do this by hand from the **ConjureOS** checkout. After it succeeds, normal CI
version bumps work again.

**Run steps 2–3 once PER PROJECT — the listing was destroyed on both.** A
bootstrap on dev does nothing for prod: `publish-app.mjs` resolves the row per
project (`:410-416`), and the workflow itself has two separate publish steps
with per-project refs, anon keys and bot passwords
(`publish-store.yml:82-106`). Do **dev first**
(`mqpvjlsywrptefgwuztn`, dev anon key, `PUBLISH_BOT_DEV_PASSWORD`), verify a
fresh install works, and only then repeat for **prod**
(`ntgelbtepecqsqloxmct`, prod anon key, `PUBLISH_BOT_PROD_PASSWORD`).

**Step 1 — build the bundle in the FINANCE repo.** *Idempotent.*
```
cd /home/user/conjureos-finance
npm ci && npm run build:inline
```
Expected output: ends with `✓ built in <n>s`; `dist/index.html` exists and is
non-empty. (`publish-app.mjs` reads the HTML before signing in, so an empty file
fails fast and harmlessly.)

**Step 2 — dry run from the CONJUREOS checkout.** *Idempotent, writes nothing.*
The script needs **four env vars** (`publish-app.mjs:32-36`) that the doc-free
version of this command silently omits, and the `--html` / `--package-json`
paths are relative to your cwd — which is now ConjureOS, not finance — so use
**absolute paths**.

> **Alternative to the bot password: a pre-minted token.** `PUBLISH_BOT_EMAIL` /
> `PUBLISH_BOT_PASSWORD` are only required on the password path — set
> `PUBLISH_BOT_ACCESS_TOKEN` instead and the script skips both
> (`publish-app.mjs:114`, `:116-123`). That is exactly the "service-role/OTP
> backdoor" (`mint-bot-token.mjs`) used for the `0.5.3` publishes, and it is
> worth knowing because the bot password may no longer be recoverable while the
> mint path still is.

```
cd /home/user/ConjureOS
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_ANON_KEY="<the project's anon key>"
export PUBLISH_BOT_EMAIL="conjureosbot@gmail.com"
export PUBLISH_BOT_PASSWORD="<bot password for THIS project>"

node scripts/publish-app.mjs --dry-run \
  --first-publish \
  --slug finance \
  --display-name "Conjure Finance" \
  --icon 💰 \
  --tags finance \
  --visibility public \
  --changelog "Initial version" \
  --html /home/user/conjureos-finance/dist/index.html \
  --package-json /home/user/conjureos-finance/package.json
```
Expected output: a header line `ConjureOS anchor-app publish — DRY RUN`
(`publish-app.mjs:376`) followed by `[dry-run] Would CREATE store_apps row for
slug "finance"…` (`:418`). Nothing is written. If it instead reports that an app
already exists, the row was re-created — **stop, drop `--first-publish`, and
ship a normal version bump.**

**Step 3 — the real bootstrap.** **DESTRUCTIVE on success, then refuses to
rerun** — it creates a live public store listing, and a second run errors with
`--first-publish given but an app already exists … Drop --first-publish to ship
a new version.` (`publish-app.mjs:410-416`). Re-run the same command **without**
`--dry-run`.

Expected output:
```
→ Uploading initial HTML (<n> bytes) to store-apps/<uuid>/<uuid>.html
✓ Created store_apps row <uuid> (slug "finance", public) + registered v1.
```
(`publish-app.mjs:307`, `:344`.) On failure the script removes the orphaned
upload before exiting (`:340`), so a failed attempt leaves no litter.

**Optional — keystone/featured listing.** Add `--featured` to mark it a
team-owned keystone app (`✓ Marked featured (team-owned keystone app).`,
`publish-app.mjs:364`). This is an **admin-only** flip: RLS silently no-ops for
a non-admin bot, and the script reads back to confirm. Omitting it publishes a
normal public listing. Decide deliberately — anchor apps are normally featured,
and slug lookup checks featured rows first (`:228-234`).

**Step 4 — hand it back to CI.** *Idempotent per trigger.* Once the row exists,
Actions → "Publish to ConjureOS App Store" → Run workflow ships to **dev**; a
published GitHub Release ships to **prod**. Expected tail:
`✓ Published "Conjure Finance" (finance) version N`.

> **The release→prod half is not safe to use until root cause #3 is fixed.** Any
> changelog containing a backtick, `"` or `$` breaks the job, and the release
> body is shell source on a runner holding the publish credentials. Fix the
> `env:` block first, or publish to prod via the bootstrap/backdoor path and
> leave Releases alone.

**Republish guards to know about** (`store-version/index.ts:~600-650`): it
refuses a publish whose content SHA is unchanged, and refuses an `app_version`
that is not **greater** than the currently published one. Bump `package.json`'s
`version` every time. (The action also enforces `package.json` version ==
`src/version.ts` `APP_VERSION` when that file exists — finance does not use that
convention, so the check is skipped.)

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

Findings from reading the code as it stands, verified against source. Items 1
and 2 are the two that make the live-data restart plan bigger than it looks.

**1. A store-installed Finance cannot authenticate to its own backend.** This is
the single biggest hidden cost in a restart, and it is work in the **ConjureOS**
repo, not this one.

- Every finance edge function requires the caller's JWT and 401s without it:
  `finance-read/index.ts:41-51` (`missing_authorization_header` →
  `not_signed_in`), same guard at `plaid-sync/index.ts:109-112`.
- The kernel returns **`null`** — not a token — for any app whose path is not in
  the built-in set: `src/kernel/index.ts:1967`,
  `if (!BUILT_IN_APP_PATHS.has(this.currentApp)) { return { ok: true, result: null }; }`.
  This gate is deliberate: `getUser` / `getAccessToken` expose the raw user
  Supabase JWT, and the check is on the **kernel-authoritative** path set rather
  than the app-writable `manifest.builtIn` flag precisely so an app cannot lift
  the token (`SECURITY.md` invariants I1/I2, `PHASE_36_DESIGN.md` V1).
- `BUILT_IN_APP_PATHS` is derived from `DEFAULT_APPS`
  (`src/kernel/index.ts:99-101`), and **`finance` is not in it** — it is a
  store-installed app at `/apps/finance`. (The `DEFAULT_APPS` membership list
  drifts; re-read `src/kernel/defaultApps.ts` rather than trusting any list
  written down here.)
- So `getHostAccessToken` (`conjureos-finance/src/platform/host.ts:90-98`),
  which `src/api/index.ts:37` wires in as the synced path's default token
  source, **always resolves to `null` in production**.

Net: the day someone finishes a live `FinanceApi`, every call returns
`unauthorized`. Note the contrast with `auth.whoami()`, which **is** granted to
all apps (`kernel/index.ts:1942-1959`) — that is why the signed-in user badge
works today while data access would not. Options and the `recipes-db` precedent
are in `finance-restart-checklist` step 5. **Decide this before estimating
anything else.**

**2. The frontend has no client for the backend that actually shipped — and it
points at a project that no longer exists.** `buildFinanceApi()`'s `synced` mode
(`src/api/index.ts:28-42`) builds `SyncedFinanceApi` over `HttpSyncTransport`
(`src/api/sync/httpTransport.ts:24` — *not* `transport.ts`, which holds only
types and `RecordKind`). That transport POSTs to two endpoints that **do not
exist anywhere**:

```
// httpTransport.ts:1-5
//   POST {base}/sync-pull   { cursor, kinds }      -> PullResult
//   POST {base}/sync-push   { items }              -> EncryptedRecord[]
```
(calls at `httpTransport.ts:54-60`.) `ConjureOS/supabase/functions/` contains no
`sync-pull` or `sync-push` — only `plaid-sync` — and no ConjureOS migration
creates an `encrypted_records` table. The base URL they target,
`VITE_SYNC_BASE_URL`, is documented in `.env.example` as "Base URL of the
**conjureos-finance-backend** Supabase project edge functions" — the very
project **retired by the 2026-05-28 consolidation decision**. `README.md` still
names that repo too.

Do not go looking for `sync-pull`; it is gone with its project. Artifacts still
pointing at the phantom backend, all needing correction: `httpTransport.ts`,
`.env.example`, `README.md`, and the `synced` branch of `src/api/index.ts`.
Building the real `RestFinanceApi` over `finance-read` is net-new work.

**3. `vault.unlock()` is never called, so `synced` mode is dormant anyway.**
There is no passphrase UI. Even the E2E path could not be used today.

**4. The app claims end-to-end encryption on FIVE surfaces, and it is not true
of the shipped backend.** Four are user-facing: `README.md` design-goal bullets;
the sidebar badge at `src/components/Layout.tsx:126`; and **two separate claims**
in `src/components/Settings.tsx` — the `Encryption` line at `:88` ("End-to-end
(AES-GCM, key never leaves device)") and the `What the server stores` line at
`:90` ("Opaque ids + ciphertext only") with its paragraph at `:91-94` ("no
merchant, amount, or category ever reaches the server in the clear"). The fifth
is developer-facing and easy to miss because it is not on screen:
**`.env.example:3`**, `"synced" -> end-to-end encrypted sync against the Supabase
backend`. Fix all five before any live data. This is a truthfulness issue, not a
cosmetic one.

**5. `finance.delete_vault_secret` does not exist on dev or prod.**
`plaid-unlink/index.ts:117` calls `svc.rpc("delete_vault_secret", …)`, but the
migration that creates it — `036_finance_vault_delete.sql` — is **still parked
on the unmerged branch `claude/dev-branch-sync-deploy-Yjz2L`** and is absent
from both `dev` and `main` (the applied migrations jump `035` → `037`). The call
is best-effort (it only `console.warn`s at `:121-123`), so unlinking still
works, but **every unlink orphans a `vault.secrets` row holding a real Plaid
access token**. Ship it before production Plaid. Related numbering hazard:
migration **036 is reserved** for that file — onboarding deliberately jumped 035
→ 037 to avoid a ledger collision. Do not reuse 036, and expect to reconcile
ordering when that branch lands (Supabase's `db push` enforces remote-ledger =
local-files).

**6. `transactions.user_category` is an encrypted column that nothing
encrypts.** Migration 088 encrypts it and `finance-read` decrypts it
(`finance-read/index.ts:104`), but `plaid-sync` never writes it — by design, it
is the **only** column an authenticated client may UPDATE directly
(`035_finance_schema.sql:161`, `grant update (user_category)`). A client writing
a plain category string there stores plaintext into an envelope column, and
because the decrypt loop wraps a `Promise.all` over **all** rows in one `try`
(`finance-read/index.ts:86-107`) and fails closed (`:108-112`), **one bad value
breaks that user's entire read — accounts included.** Two different errors to
grep for, depending on the string: a value with fewer than two dots throws
`unrecognized finance ciphertext envelope` (`fieldCrypto.ts:112-114`), while a
dotted value like `food.dining.out` throws `no key for envelope id "food"`
(`:121-123`). Decide one of: route recategorization through a new
encrypt-on-write edge function, revoke the direct column grant, or make decrypt
tolerate a legacy plaintext value. **Do not leave this ambiguous.**

**7. `finance.budgets` is not encrypted.** Budget `amount`s are plain
`numeric(18,2)` and client-CRUD'd (`035:169-188`). That may be an acceptable
sensitivity call, but it is an *implicit* one — record the decision explicitly.

**8. `finance.recurring` is a server table nothing populates.** Recurring
detection is client-side in `src/analytics/recurring.ts`; the table
(`035:195-217`) was scaffolded for a server-side pass that was never written.
Either populate it or drop it, so nobody assumes it holds data.

**9. Docstring drift: three files say "migration 087" where they mean 088.**
`finance-read/index.ts:4`, `plaid-sync/index.ts:202` and `:308`. The actual
migration is `088_finance_field_encryption.sql`. Harmless, but it will send a
reader to the wrong file (087 is the Recipes rating migration).

**10. `fieldCrypto` has no test file in the repo.** `DECISIONS_ARCHIVE.md:71`
describes it as "unit-tested incl. the rotation window" — and so does **PR
#396's own body**, which is the stronger citation because **its file list (13
files) contains no test file at all**: `fieldCrypto.ts`, migration 088, four
edge functions, five docs, one research note. Independently: no file matching
`fieldCrypto` / `encryptField` exists on `origin/dev`, `origin/main`, or the
parked branch — only the module, `plaid-sync`, `finance-read` and
`docs-content.ts` reference it. **Write the tests before trusting a key
rotation**: the rotation window (an envelope written under `v1` decrypting via
`FINANCE_DEK_OLD` while `v2` is current) is exactly the behavior you want proven
before it runs against real data.

**11. `decryptNumber` has no NaN guard — the one seam that fails QUIETLY.**
Everywhere else the encryption layer fails loudly and closed: a bad envelope
throws and `finance-read` returns `500 decrypt_failed`, and `plaid-sync` cannot
write plaintext because its encrypt `Promise.all`s (`:203-217`, `:311-325`) are
unguarded, so a keyring failure rejects the request before any upsert. But
`fieldCrypto.ts:133-136` returns `Number(s)` unchecked, and `JSON.stringify(NaN)`
is `null` — so a value that *decrypts fine but is not numeric* comes back as a
**silent `null` amount** in the response, not an error. Add a guard when you
touch this.

**12. No Plaid webhook receiver exists.** `plaid-sync`'s header comments
anticipate a webhook caller ("Webhook (future) when Plaid fires
`SYNC_UPDATES_AVAILABLE`"), but no function is wired to receive it. Today sync
only happens when a client calls it. Background alerts depend on this.

**13. `plaid-sync` caps a single call at `MAX_PAGES = 50`** (25k transactions,
`plaid-sync/index.ts:252`) and reports `fully_synced` accordingly (`:376`); the
cursor is persisted after **every** page, so re-running resumes safely. Also
expect `202 product_not_ready` on brand-new items while Plaid backfills history
— the client is meant to retry (`retry_after_ms: 2000`), not treat it as
failure.

**14. The publish workflow interpolates user text into a `run:` block
(`conjureos-finance#14`).** `.github/workflows/publish-store.yml:69` (and
`:70`, `:71`, `:73`) inlines `${{ github.event.release.body }}` and friends into
shell source on a runner holding the publish credentials. It is a script
injection **and** it crashes on an ordinary backtick, so the release→prod path
is unreliable. Recipes and fitness both fixed it with an `env:` block; finance
did not. Full detail and the copy-paste fix in `finance-ci-publishing`, root
cause #3.

**15. TWO unit conversions flip between client and server, not one.** The
client uses **negative = money out**, in **integer cents** (`types.ts:10`).
Plaid — and therefore `finance.transactions.amount` and what `finance-read`
returns — uses **positive = outflow** (`035:113-115`,
`plaid-sync/index.ts:80`) in **decimal currency units** (`decryptNumber`,
`fieldCrypto.ts:133-136`). An adapter needs `-Math.round(plaidAmount * 100)`:
**a sign flip AND a scale change**. Naming only the sign is exactly how the
second half gets missed. This is a classic silent-wrong-numbers bug and it is in
the money path.

---
## Reference map

`id: finance-reference-map`

**Frontend — `Jonny-B/conjureos-finance`, branch `dev` @ `45653c1` (`0.5.3`)**

| Path | What |
| --- | --- |
| `STATUS.md` | The paused-state memo (owner-facing) |
| `README.md` | **Carries stale E2E claims + names the retired backend repo** |
| `.env.example` | **`VITE_SYNC_BASE_URL` points at the retired finance-backend project**; `:3` is a fifth false-E2E claim. Defines `VITE_FINANCE_API`, `VITE_SYNC_BASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_INFERENCE_PROVIDER`, `VITE_ANTHROPIC_API_KEY`, `VITE_ANTHROPIC_MODEL` — note it does **not** define `VITE_BANK_PROVIDER`, which `bankProvider.ts:114` reads |
| `src/App.tsx` | Routes; the `MemoryRouter` rationale |
| `src/components/Layout.tsx` | Responsive shell, nav definitions, alert→notify bridge, the false E2E badge (`:126`) |
| `src/components/Settings.tsx` | Two more false E2E claims (`:87-94`) |
| `src/api/contract.ts` | `FinanceApi` — the only surface the UI depends on |
| `src/api/types.ts` | Canonical domain model (cents, sign convention at `:10`) |
| `src/api/index.ts` | The mock/synced factory (`:28-42`, `VITE_FINANCE_API`) |
| `src/api/mock/` | Deterministic multi-month seed + `MockFinanceApi` |
| `src/api/sync/transport.ts` | Wire **types** + `RecordKind` only |
| `src/api/sync/httpTransport.ts` | The dead transport — `sync-pull` / `sync-push` (`:24`, `:54-60`) |
| `src/api/synced/`, `src/crypto/` | The retired E2E path (dormant; `vault.unlock()` never called) |
| `src/analytics/` | Recurring, net worth, budget suggest, alerts, date helpers |
| `src/orchestrator/` | Categorizer, month parsing, inference provider routing |
| `src/sync/bankProvider.ts` | `BankProvider` seam (`VITE_BANK_PROVIDER`) |
| `src/enrich/merchant.ts` | `MerchantEnricher` seam |
| `src/platform/host.ts` | ConjureOS bridge: SSO (`:90-98`, always null for this app), whoami, notify, action registration |
| `src/store/FinanceContext.tsx` | App state + the three orchestrator action handlers |
| `.github/workflows/publish-store.yml` | Store publish (needs `CONJUREOS_REPO_TOKEN`); **`:69-73` shell injection, issue #14** |

**Backend, kernel and process — `Jonny-B/ConjureOS`, `origin/dev` @ `72bbbdf`**

| Path | What |
| --- | --- |
| `supabase/migrations/035_finance_schema.sql` | `finance.*` schema, RLS, grants, Vault wrappers |
| `supabase/migrations/088_finance_field_encryption.sql` | Sensitive columns → ciphertext `text` |
| `supabase/migrations/085_store_apps_publish_authority.sql` | Why a direct `store_apps` INSERT is blocked |
| `supabase/functions/_shared/fieldCrypto.ts` | AES-GCM keyring, encrypt/decrypt/decryptNumber |
| `supabase/functions/plaid-link-token/` | Create a Plaid Link token |
| `supabase/functions/plaid-exchange/` | public token → item; access token into Vault; **#326 already fixed at `:131-140`** (guard `:131`, safe log `:132-140`) |
| `supabase/functions/plaid-sync/` | `/accounts/get` + `/transactions/sync`; encrypt on write |
| `supabase/functions/plaid-list-items/` | The caller's linked institutions |
| `supabase/functions/plaid-unlink/` | Plaid `/item/remove` + cascade delete + vault cleanup (broken RPC) |
| `supabase/functions/finance-read/` | The decrypt-on-read chokepoint |
| `supabase/functions/recipes-db/` | **The minted-token precedent** for app→backend auth (`:1-21`) |
| `supabase/functions/admin-docs/docs-content.ts` | **Port target** for this doc; existing `finance-encryption` entry at `:992-1010` |
| `src/kernel/index.ts` | `BUILT_IN_APP_PATHS` (`:99-101`), the token gate (`:1967`), `whoami` (`:1942-1959`) |
| `src/kernel/defaultApps.ts` | `DEFAULT_APPS` — the set `finance` is not in |
| `src/platform/appStore.ts` | `STORE_TAGS` incl. the surviving `finance` tag (`:42`) |
| `scripts/publish-app.mjs` | The publish CLI: env (`:32-36`), first-publish (`:294-370`), guards (`:410-415`) |
| `.github/actions/publish-anchor-app/action.yml` | The composite action (no `--first-publish`, `:163-188`) |
| `FINANCE_ENCRYPTION.md` | **The key runbook** — setup, rotation, recovery |
| `SECURITY_FIXES.md` | "Finance data security" — the five layers (**stale: F4 shows IN PROGRESS**) |
| `PHASE_36_DESIGN.md` | Design of record for the five security layers + invariants V1 |
| `SECURITY.md` | Security invariants I1/I2 — why built-ins alone get the JWT |
| `LEGAL_ACTIVATION.md` | Phase 43 legal go-live checklist — the `[Legal Entity]` proxy for LLC status |
| `ANCHOR_APP_CI_SETUP.md` | Anchor-app publish pipeline, §5 = `CONJUREOS_REPO_TOKEN` |
| `DECISIONS_ARCHIVE.md` | 2026-05-28 (consolidation + server-readable model + 036 reservation), 2026-05-29 (Plaid-revoke opt-out), 2026-06-24 (layer #4) |
| `STATUS_ARCHIVE.md` | 2026-06-23, 06-24, 06-24/25 finance entries (incl. the pause + removal) |
| `OPEN_QUESTIONS.md` | The parked prod-secrets reminder (`:31-37`) |
| `TROUBLESHOOTING.md:433` | The `Script error.` / `MemoryRouter` fix |
| `CLAUDE.md` | Runbook contract; §5 admin-docs own-commit rule |

**Issue trackers**

| Issue | What |
| --- | --- |
| `conjureos-finance` **#15** | "Restart blockers" — the tracking issue for the gaps in `finance-known-gaps`. Start here on resume. |
| `conjureos-finance` **#14** | The `publish-store.yml` changelog injection (`finance-ci-publishing` root cause #3). Open, `security`/`ci`. |
| ConjureOS **#326** | `plaid-exchange` logging — **code already fixed; close the issue**, splitting out its `claimUsername` half. |
| ConjureOS **#387–#390** | Finance security layers F1/F2/F3/F5, all open, under umbrella **#268**. |

**Parked branches (unmerged, still valid work)**

- ConjureOS `claude/dev-branch-sync-deploy-Yjz2L` — migration
  `036_finance_vault_delete.sql` (the missing `delete_vault_secret` RPC) plus
  the sandbox test script.
- ConjureOS `claude/conjure-finance-app-4eLif` — `PHASE_FINANCE_DESIGN.md`
  (the keystone backend-bridge design doc), never merged, separate lineage.
- `conjureos-finance` `claude/mint-clone-app-VtqDi` — the preserved E2E
  prototype, kept in case a Plaid-free "manual entry" mode is ever wanted.
