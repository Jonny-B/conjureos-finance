// Anthropic-backed categorization. Runs in the browser so plaintext never hits
// our server. Credentials/budget are resolved by the host app (ConjureOS) in
// priority order tier -> group -> BYK; this provider just consumes whatever
// the resolver hands back, and reports unavailable when there's nothing to use.

import { matchRules } from "../rules";
import type { CategorizeRequest, CategorizeResult, InferenceBudget, InferenceProvider } from "./types";

export interface ResolvedCredential {
  apiKey: string;
  source: "tier" | "group" | "byk";
  /** remaining tier/group requests, null = unknown/unlimited (e.g. BYK) */
  remaining: number | null;
  resetsAt: string | null;
  /** optional proxy base (e.g. a ConjureOS inference gateway) */
  baseUrl?: string;
  model: string;
}

/**
 * Supplied by the app. Returns null when there is no tier budget, no group key
 * and no user key — in which case the orchestrator falls back to heuristics.
 */
export type CredentialResolver = () => Promise<ResolvedCredential | null>;

const HIGH_CONFIDENCE = 0.9;

export class AnthropicProvider implements InferenceProvider {
  readonly name = "anthropic";

  constructor(private resolve: CredentialResolver) {}

  async available(): Promise<boolean> {
    const cred = await this.resolve();
    if (!cred) return false;
    if (cred.remaining != null && cred.remaining <= 0) return false;
    return true;
  }

  async budget(): Promise<InferenceBudget> {
    const cred = await this.resolve();
    if (!cred) return { remaining: 0, resetsAt: null, source: "none" };
    return { remaining: cred.remaining, resetsAt: cred.resetsAt, source: cred.source };
  }

  async categorize(req: CategorizeRequest): Promise<CategorizeResult> {
    const cred = await this.resolve();
    if (!cred) throw new Error("no inference credential available");

    // Cheap rule pass first to spend as little budget as possible.
    const predictions: CategorizeResult["predictions"] = {};
    const ambiguous = req.transactions.filter((t) => {
      const hit = matchRules(t.merchantName, t.rawDescription);
      if (hit && hit.confidence >= HIGH_CONFIDENCE) {
        predictions[t.id] = {
          categoryId: hit.categoryId,
          confidence: hit.confidence,
          reasoning: `Matched rule "${hit.matched}".`,
        };
        return false;
      }
      return true;
    });

    if (ambiguous.length > 0) {
      const ai = await this.callModel(cred, req.categories, ambiguous);
      Object.assign(predictions, ai);
    }

    return { predictions, engine: `${cred.source}:${cred.model}` };
  }

  private async callModel(
    cred: ResolvedCredential,
    categories: CategorizeRequest["categories"],
    txns: CategorizeRequest["transactions"],
  ): Promise<CategorizeResult["predictions"]> {
    const base = (cred.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    const catList = categories.map((c) => `${c.id}: ${c.name}`).join("\n");
    const txnList = txns
      .map((t) => `${t.id} | ${t.merchantName} | ${t.rawDescription} | ${(t.amountCents / 100).toFixed(2)}`)
      .join("\n");

    const system =
      "You categorize bank transactions. Respond ONLY with a JSON array of " +
      '{"id","categoryId","confidence","reasoning"}. categoryId MUST be one of ' +
      "the provided ids or null if none fit. confidence is 0..1. Keep reasoning under 12 words.";
    const user = `Categories:\n${catList}\n\nTransactions (id | merchant | raw | amount):\n${txnList}`;

    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cred.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: cred.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "[]";
    return parsePredictions(text, new Set(categories.map((c) => c.id)));
  }
}

function parsePredictions(text: string, validIds: Set<string>): CategorizeResult["predictions"] {
  const out: CategorizeResult["predictions"] = {};
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : null;
    if (!id) continue;
    const catId = typeof r.categoryId === "string" && validIds.has(r.categoryId) ? r.categoryId : null;
    const confidence = typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.5;
    const reasoning = typeof r.reasoning === "string" ? r.reasoning : "Model suggestion.";
    out[id] = { categoryId: catId, confidence, reasoning };
  }
  return out;
}
