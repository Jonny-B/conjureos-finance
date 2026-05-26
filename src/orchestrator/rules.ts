// Deterministic merchant -> category rules. This is both the heuristic engine's
// backbone and the cheap first pass that keeps AI spend (and request budget) low.

export interface MatchRule {
  /** lowercased substrings to look for in merchant + raw descriptor */
  patterns: string[];
  categoryId: string;
  /** base confidence when a pattern hits */
  confidence: number;
}

export const RULES: MatchRule[] = [
  { patterns: ["payroll", "dir dep", "direct deposit", "salary"], categoryId: "cat_income", confidence: 0.97 },
  { patterns: ["whole foods", "wholefds", "trader joe", "safeway", "kroger", "grocery", "aldi"], categoryId: "cat_groceries", confidence: 0.95 },
  { patterns: ["chipotle", "starbucks", "blue bottle", "mcdonald", "restaurant", "cafe", "coffee", "doordash", "ubereats", "uber eats", "grubhub", "pizza", "bar & grill"], categoryId: "cat_dining", confidence: 0.9 },
  { patterns: ["uber", "lyft", "shell", "chevron", "exxon", "gas", "metro", "transit", "parking", "76 "], categoryId: "cat_transport", confidence: 0.88 },
  { patterns: ["amazon", "amzn", "target", "walmart", "best buy", "etsy", "ebay"], categoryId: "cat_shopping", confidence: 0.82 },
  { patterns: ["comcast", "xfinity", "verizon", "at&t", "t-mobile", "pse ", "billpay", "electric", "energy", "water", "utility"], categoryId: "cat_bills", confidence: 0.9 },
  { patterns: ["rent", "apts", "mortgage", "apartments", "property mgmt", "hoa"], categoryId: "cat_housing", confidence: 0.93 },
  { patterns: ["walgreens", "cvs", "pharmacy", "clinic", "dental", "medical", "hospital"], categoryId: "cat_health", confidence: 0.85 },
  { patterns: ["amc", "cinemark", "regal", "steam", "playstation", "xbox", "ticketmaster", "concert"], categoryId: "cat_entertainment", confidence: 0.85 },
  { patterns: ["netflix", "spotify", "hulu", "disney+", "apple.com/bill", "icloud", "youtube premium", "patreon", "substack"], categoryId: "cat_subscriptions", confidence: 0.93 },
  { patterns: ["delta air", "united air", "american air", "airbnb", "marriott", "hilton", "expedia", "hotel"], categoryId: "cat_travel", confidence: 0.88 },
  { patterns: ["fee", "service charge", "interest charged", "atm wd", "overdraft"], categoryId: "cat_fees", confidence: 0.9 },
];

export interface RuleHit {
  categoryId: string;
  confidence: number;
  matched: string;
}

export function matchRules(merchant: string, raw: string): RuleHit | null {
  const hay = `${merchant} ${raw}`.toLowerCase();
  let best: RuleHit | null = null;
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      if (hay.includes(p)) {
        if (!best || rule.confidence > best.confidence) {
          best = { categoryId: rule.categoryId, confidence: rule.confidence, matched: p };
        }
      }
    }
  }
  return best;
}
