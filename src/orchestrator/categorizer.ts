// The categorization orchestrator.
//
// Given the user's transactions + categories, it:
//   1. picks the best available inference engine (AI if budget/key, else heuristic)
//   2. predicts a category + confidence for each transaction
//   3. auto-applies high-confidence predictions (status "auto")
//   4. routes low-confidence / no-match rows to the review queue (needs_review)
//
// The user never has to categorize by hand; they only confirm the handful the
// orchestrator was unsure about.

import type { FinanceApi } from "../api/contract";
import type { Category, CategorizationStatus, Transaction } from "../api/types";
import type { InferenceProvider } from "./inference/types";
import { resolveMonthScope, isInScope, formatScope } from "./month";

export const ORCHESTRATOR_VERSION = "orchestrator-1";

/** Predictions at/above this go in automatically; below go to review. */
export const AUTO_APPLY_THRESHOLD = 0.85;

export interface CategorizationRunResult {
  engine: string;
  autoApplied: number;
  needsReview: number;
  processed: number;
  /** Human label of the month scope when one was applied, e.g. "February 2026". */
  scopeLabel?: string;
}

export interface RunOptions {
  /** which transactions to consider; defaults to anything not yet confirmed */
  includeConfirmed?: boolean;
  autoApplyThreshold?: number;
  /**
   * Scope the run to a single month. Free-text: "February", "Feb 2026",
   * "2026-02". The year is inferred from the data when omitted. An
   * unparseable value is ignored (the run covers every month).
   */
  month?: string;
}

export class CategorizationOrchestrator {
  constructor(
    private api: FinanceApi,
    private provider: InferenceProvider,
  ) {}

  /** Resolve the engine + remaining tier/group budget for display in the UI. */
  budget() {
    return this.provider.budget();
  }

  async run(categories: Category[], transactions: Transaction[], opts: RunOptions = {}): Promise<CategorizationRunResult> {
    const threshold = opts.autoApplyThreshold ?? AUTO_APPLY_THRESHOLD;

    // Resolve an optional month scope against the full set (so a bare
    // "February" can infer its year from the data) before filtering.
    const scope = opts.month ? resolveMonthScope(opts.month, transactions.map((t) => t.date)) : null;
    const scopeLabel = scope ? formatScope(scope) : undefined;

    const targets = transactions.filter((t) => {
      if (!opts.includeConfirmed && t.categorization.status === "confirmed") return false;
      if (scope && !isInScope(t.date, scope)) return false;
      return true;
    });

    if (targets.length === 0) {
      return { engine: this.provider.name, autoApplied: 0, needsReview: 0, processed: 0, ...(scopeLabel && { scopeLabel }) };
    }

    const result = await this.provider.categorize({ transactions: targets, categories });

    const updates: Parameters<FinanceApi["applyCategorizations"]>[0] = [];
    let autoApplied = 0;
    let needsReview = 0;

    for (const t of targets) {
      const pred = result.predictions[t.id];
      if (!pred) continue;
      const confident = pred.categoryId != null && pred.confidence >= threshold;
      const status: CategorizationStatus = confident ? "auto" : "needs_review";
      if (confident) autoApplied++;
      else needsReview++;
      updates.push({
        id: t.id,
        categoryId: confident ? pred.categoryId : null,
        status,
        confidence: pred.confidence,
        suggestedCategoryId: pred.categoryId,
        reasoning: pred.reasoning,
        orchestratorVersion: `${ORCHESTRATOR_VERSION}/${result.engine}`,
      });
    }

    await this.api.applyCategorizations(updates);
    return { engine: result.engine, autoApplied, needsReview, processed: updates.length, ...(scopeLabel && { scopeLabel }) };
  }
}
