// Merchant enrichment seam — clean display names + logos for raw bank
// descriptors. Mock-backed today (a local lookup table + emoji glyphs, no
// network), structured so Plaid's Enrich product (or a logo API) drops in
// behind the same `MerchantEnricher` interface with a config swap.

export interface EnrichedMerchant {
  displayName: string;
  /** glyph used as a lightweight logo stand-in (no network fetch in mock mode) */
  emoji: string;
  /** canonical domain, when known — a real logo provider would key off this */
  domain?: string;
}

export interface MerchantEnricher {
  readonly mode: "mock" | "plaid";
  enrich(merchantName: string, raw?: string): EnrichedMerchant;
}

interface Entry {
  match: string;
  emoji: string;
  domain?: string;
}
// Substring → glyph/domain. Ordered: first hit wins.
const TABLE: Entry[] = [
  { match: "netflix", emoji: "🎬", domain: "netflix.com" },
  { match: "spotify", emoji: "🎵", domain: "spotify.com" },
  { match: "icloud", emoji: "☁️", domain: "apple.com" },
  { match: "apple.com", emoji: "", domain: "apple.com" },
  { match: "amazon", emoji: "📦", domain: "amazon.com" },
  { match: "amzn", emoji: "📦", domain: "amazon.com" },
  { match: "whole foods", emoji: "🥬", domain: "wholefoodsmarket.com" },
  { match: "trader joe", emoji: "🛒" },
  { match: "uber eats", emoji: "🍔" },
  { match: "uber", emoji: "🚗", domain: "uber.com" },
  { match: "lyft", emoji: "🚙", domain: "lyft.com" },
  { match: "blue bottle", emoji: "☕" },
  { match: "starbucks", emoji: "☕", domain: "starbucks.com" },
  { match: "chipotle", emoji: "🌯", domain: "chipotle.com" },
  { match: "shell", emoji: "⛽" },
  { match: "target", emoji: "🎯", domain: "target.com" },
  { match: "comcast", emoji: "📡" },
  { match: "xfinity", emoji: "📡" },
  { match: "puget sound", emoji: "⚡" },
  { match: "pse", emoji: "⚡" },
  { match: "apartments", emoji: "🏠" },
  { match: "apts", emoji: "🏠" },
  { match: "rent", emoji: "🏠" },
  { match: "walgreens", emoji: "💊", domain: "walgreens.com" },
  { match: "cvs", emoji: "💊" },
  { match: "amc", emoji: "🍿" },
  { match: "payroll", emoji: "💰" },
  { match: "dir dep", emoji: "💰" },
  { match: "delta", emoji: "✈️" },
  { match: "atm", emoji: "🏧" },
  { match: "paypal", emoji: "🅿️" },
];

class MockMerchantEnricher implements MerchantEnricher {
  readonly mode = "mock" as const;
  enrich(merchantName: string, raw?: string): EnrichedMerchant {
    const hay = `${merchantName} ${raw ?? ""}`.toLowerCase();
    const hit = TABLE.find((e) => hay.includes(e.match));
    return {
      displayName: merchantName,
      emoji: hit?.emoji || "💳",
      ...(hit?.domain && { domain: hit.domain }),
    };
  }
}

/**
 * Plaid-backed enrichment (display names + logos via Plaid Enrich). Not wired
 * until Plaid prod lands — it would call the ConjureOS `plaid-enrich` edge
 * function (or read enriched fields off synced transactions). Left as a typed
 * placeholder so the swap is a one-line factory change.
 */
class PlaidMerchantEnricher implements MerchantEnricher {
  readonly mode = "plaid" as const;
  enrich(): EnrichedMerchant {
    throw new Error("Plaid merchant enrichment is not enabled yet");
  }
}

function build(): MerchantEnricher {
  const mode = (import.meta.env.VITE_MERCHANT_ENRICH as string) || "mock";
  return mode === "plaid" ? new PlaidMerchantEnricher() : new MockMerchantEnricher();
}

let enricher: MerchantEnricher | null = null;
export function enrichMerchant(merchantName: string, raw?: string): EnrichedMerchant {
  if (!enricher) enricher = build();
  return enricher.enrich(merchantName, raw);
}
