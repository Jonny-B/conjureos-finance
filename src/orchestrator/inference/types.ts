// Inference abstraction for the categorization orchestrator.
//
// Categorization runs entirely client-side (plaintext never touches our server).
// Which engine actually answers is resolved at runtime in this order:
//
//   tier credits  ->  group key  ->  user's own key (BYK)  ->  heuristic
//
// The heuristic provider needs no network and no key, so the feature always
// works; the AI providers improve accuracy when budget/credentials exist.

import type { Category, Transaction } from "../../api/types";

export interface CategorizeRequest {
  transactions: Transaction[];
  categories: Category[];
}

export interface CategorizeResult {
  /** transaction id -> prediction */
  predictions: Record<
    string,
    {
      categoryId: string | null;
      confidence: number; // 0..1
      reasoning: string;
    }
  >;
  /** name reported back to the UI, e.g. "tier:claude-haiku" or "heuristic" */
  engine: string;
}

/** Remaining request allowance for tier/group-funded inference. */
export interface InferenceBudget {
  /** null = unknown/unlimited */
  remaining: number | null;
  resetsAt: string | null;
  source: "tier" | "group" | "byk" | "none";
}

export interface InferenceProvider {
  readonly name: string;
  /** Whether this provider can serve right now (has key/budget). */
  available(): Promise<boolean>;
  budget(): Promise<InferenceBudget>;
  categorize(req: CategorizeRequest): Promise<CategorizeResult>;
}
