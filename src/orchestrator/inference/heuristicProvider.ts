// Zero-dependency, offline categorization engine. Always available. Uses the
// shared rule table; emits low confidence when nothing matches so those rows
// fall into the review queue.

import { matchRules } from "../rules";
import type { CategorizeRequest, CategorizeResult, InferenceBudget, InferenceProvider } from "./types";

export class HeuristicProvider implements InferenceProvider {
  readonly name = "heuristic";

  available(): Promise<boolean> {
    return Promise.resolve(true);
  }

  budget(): Promise<InferenceBudget> {
    return Promise.resolve({ remaining: null, resetsAt: null, source: "none" });
  }

  async categorize(req: CategorizeRequest): Promise<CategorizeResult> {
    const predictions: CategorizeResult["predictions"] = {};
    for (const t of req.transactions) {
      const hit = matchRules(t.merchantName, t.rawDescription);
      if (hit) {
        predictions[t.id] = {
          categoryId: hit.categoryId,
          confidence: hit.confidence,
          reasoning: `Matched rule "${hit.matched}".`,
        };
      } else {
        predictions[t.id] = {
          categoryId: null,
          confidence: 0.2,
          reasoning: `No rule matched "${t.merchantName}".`,
        };
      }
    }
    return { predictions, engine: "heuristic" };
  }
}
