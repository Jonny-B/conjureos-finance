// One canonical phrasing for "what a categorization run did", reused by the
// review-page banner, the app-level toast, and the orchestrator's spoken reply
// so the user hears the same wording everywhere.

import type { CategorizationRunResult } from "./categorizer";

/** e.g. "Categorized 23 transactions for February 2026 — 19 auto-applied, 4 flagged for review." */
export function summarizeRun(r: CategorizationRunResult): string {
  const scope = r.scopeLabel ? ` for ${r.scopeLabel}` : "";
  if (r.processed === 0) {
    return r.scopeLabel
      ? `Nothing left to categorize for ${r.scopeLabel}.`
      : "Nothing left to categorize.";
  }
  const n = `${r.processed} transaction${r.processed === 1 ? "" : "s"}`;
  return `Categorized ${n}${scope} — ${r.autoApplied} auto-applied, ${r.needsReview} flagged for review.`;
}
