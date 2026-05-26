// Builds the categorization orchestrator and resolves which inference engine to
// use. Resolution order for AI credentials: tier credits -> group key -> BYK.
// If none of those are present (or budget is exhausted), we fall back to the
// always-available heuristic engine.

import type { FinanceApi } from "../api/contract";
import { CategorizationOrchestrator } from "./categorizer";
import { HeuristicProvider } from "./inference/heuristicProvider";
import { AnthropicProvider, type ResolvedCredential } from "./inference/anthropicProvider";
import type { InferenceProvider } from "./inference/types";

export * from "./categorizer";
export type { InferenceBudget } from "./inference/types";

/**
 * Hook the host (ConjureOS) can set to inject tier/group inference allowances.
 * Returns the active credential or null. The default implementation only knows
 * about a BYK key from env, so the app works standalone.
 */
export interface TierContext {
  /** remaining tier-funded requests for this user, null = unknown */
  tierRemaining: number | null;
  tierResetsAt: string | null;
  tierApiKey: string | null;
  tierBaseUrl?: string;
  /** a group default key (lower priority than tier budget) */
  groupApiKey: string | null;
  /** user's own key (BYK) */
  userApiKey: string | null;
  model: string;
}

export function resolveCredential(ctx: TierContext): ResolvedCredential | null {
  // 1. tier credits
  if (ctx.tierApiKey && (ctx.tierRemaining == null || ctx.tierRemaining > 0)) {
    return {
      apiKey: ctx.tierApiKey,
      source: "tier",
      remaining: ctx.tierRemaining,
      resetsAt: ctx.tierResetsAt,
      baseUrl: ctx.tierBaseUrl,
      model: ctx.model,
    };
  }
  // 2. group key
  if (ctx.groupApiKey) {
    return { apiKey: ctx.groupApiKey, source: "group", remaining: null, resetsAt: null, model: ctx.model };
  }
  // 3. BYK
  if (ctx.userApiKey) {
    return { apiKey: ctx.userApiKey, source: "byk", remaining: null, resetsAt: null, model: ctx.model };
  }
  return null;
}

function envTierContext(): TierContext {
  const env = import.meta.env;
  return {
    tierRemaining: null,
    tierResetsAt: null,
    tierApiKey: null,
    groupApiKey: null,
    userApiKey: (env.VITE_ANTHROPIC_API_KEY as string) || null,
    model: (env.VITE_ANTHROPIC_MODEL as string) || "claude-haiku-4-5-20251001",
  };
}

// Mutable so ConjureOS (or Settings UI) can update tier/group/user keys at runtime.
let tierContext: TierContext = envTierContext();
export function setTierContext(patch: Partial<TierContext>) {
  tierContext = { ...tierContext, ...patch };
}
export function getTierContext(): TierContext {
  return tierContext;
}

export function buildInferenceProvider(): InferenceProvider {
  const mode = (import.meta.env.VITE_INFERENCE_PROVIDER as string) || "heuristic";
  if (mode === "anthropic") {
    const anthropic = new AnthropicProvider(async () => resolveCredential(tierContext));
    const heuristic = new HeuristicProvider();
    // Wrap: use anthropic when available, else heuristic.
    return new FallbackProvider(anthropic, heuristic);
  }
  return new HeuristicProvider();
}

/** Tries the primary provider; falls back to the secondary when unavailable. */
class FallbackProvider implements InferenceProvider {
  readonly name = "auto";
  constructor(
    private primary: InferenceProvider,
    private secondary: InferenceProvider,
  ) {}
  async available() {
    return (await this.primary.available()) || (await this.secondary.available());
  }
  async budget() {
    return (await this.primary.available()) ? this.primary.budget() : this.secondary.budget();
  }
  async categorize(req: Parameters<InferenceProvider["categorize"]>[0]) {
    if (await this.primary.available()) {
      try {
        return await this.primary.categorize(req);
      } catch {
        // fall through to heuristic on any AI error
      }
    }
    return this.secondary.categorize(req);
  }
}

export function buildOrchestrator(api: FinanceApi): CategorizationOrchestrator {
  return new CategorizationOrchestrator(api, buildInferenceProvider());
}
