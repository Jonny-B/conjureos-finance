# Conjure Finance: instructions for Claude

A ConjureOS anchor app, in its own repo.

## App type

Sealed (ConjureOS Phase 62): the AI changes nothing in this app. `package.json`
declares `"appType": "sealed"` plus `"editable": false`, the mirror older
clients read. Never drop either key, and do not add `editStyle`: the store and
the kernel write the legacy keys themselves. A manifest that declares no type
is an AI-editable applet, which is wrong for an anchor app.
`src/__tests__/manifest.test.ts` holds all three.
