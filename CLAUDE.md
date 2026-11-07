# Conjure Finance: instructions for Claude

A ConjureOS anchor app, in its own repo.

## App type

Sealed (ConjureOS Phase 62): the AI changes nothing in this app. `package.json`
declares `"appType": "sealed"` plus `"editable": false`, the mirror older
clients read. Never drop either key, and do not add `editStyle`: the store and
the kernel write the legacy keys themselves. A manifest that declares no type
is an AI-editable applet, which is wrong for an anchor app.
`src/__tests__/manifest.test.ts` holds all three.

## Status

Paused since 2026-06-25 and off both App Stores (the listing is deleted). The app
runs on a demo dataset; Plaid production is not live (ConjureOS Phase 61, waiting
on the LLC), and nothing here calls the ConjureOS `plaid-*` or `finance-read`
functions. `README.md` says what each mode does.

`dev` carries `appType: "sealed"` (0.5.5). `main` (0.4.1) has only
`editable: false` until the owner merges finance#24.

## Do not give the actions schemas without asking

`categorizeTransactions`, `findRecurring` and `buildBudgetFromHistory` declare no
`params` or `returns`. ConjureOS Chat offers an action only when it declares one,
and the owner decided (2026-10-22, ConjureOS `DECISIONS.md`) that there is no
Conjure Finance in Chat. Adding a schema would put Finance in Chat; whether a
revived Finance should reach it is an open owner question (ConjureOS
`OPEN_QUESTIONS.md`).

## Before pushing

```
npm run typecheck && npm test && npm run build:inline
```

## Publishing

The store slug is `finance` (`.github/workflows/publish-store.yml`). Run workflow
goes to the dev project and a published release to prod. The workflow adds
versions to a listing that exists, so a publish needs ConjureOS's
`scripts/publish-app.mjs --first-publish` once per project first.
