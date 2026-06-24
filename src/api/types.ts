// Canonical domain model for Conjure Finance.
//
// This file is the single source of truth for the shape of finance data.
// Both the mock implementation and the real (E2E-encrypted) sync path
// materialize these same types, so the UI never knows or cares which is
// behind the `FinanceApi`.

export type ISODate = string; // "2026-05-21"
export type ISODateTime = string; // "2026-05-21T14:03:00.000Z"
export type Cents = number; // integer; negative = money out, positive = money in

export type AccountType =
  | "checking"
  | "savings"
  | "credit"
  | "investment"
  | "loan"
  | "cash";

export interface Account {
  id: string;
  name: string;
  institution: string;
  mask: string; // last 4, e.g. "4821"
  type: AccountType;
  /** Balance is sensitive: client-side only, encrypted at rest on the server. */
  balanceCents: Cents;
  currency: string; // ISO 4217, e.g. "USD"
  /** Loan/credit detail. Maps 1:1 onto Plaid's Liabilities product when live;
   *  seeded for credit/loan accounts in mock mode. */
  liability?: LiabilityDetail;
}

/** Credit-card / loan servicing detail (Plaid Liabilities shape, trimmed). */
export interface LiabilityDetail {
  aprPct?: number;
  nextPaymentDate?: ISODate;
  minPaymentCents?: Cents;
  statementBalanceCents?: Cents;
}

/** A user-entered asset or debt that isn't a linked account (home, car,
 *  mortgage, 401k). Folds into net worth alongside linked accounts. */
export type ManualAssetKind = "property" | "vehicle" | "cash" | "investment" | "other" | "debt";
export interface ManualAsset {
  id: string;
  name: string;
  kind: ManualAssetKind;
  /** Positive cents. For kind "debt" this is the amount owed (subtracts from net worth). */
  valueCents: Cents;
}

/** A savings goal. The "autosave" contribution is simulated (no real money
 *  movement) until a banking partner is connected — see src/sync. */
export interface SavingsGoal {
  id: string;
  name: string;
  targetCents: Cents;
  savedCents: Cents;
  createdAt: ISODateTime;
}

export interface Category {
  id: string;
  name: string;
  /** hex color used across charts and chips */
  color: string;
  /** FontAwesome-ish glyph name or emoji; UI renders a fallback if unknown */
  icon: string;
  /** null for top-level categories */
  parentId: string | null;
  /** system categories ship with the app and cannot be deleted */
  isSystem: boolean;
}

/** Lifecycle of a transaction's category assignment. */
export type CategorizationStatus =
  | "uncategorized" // never touched
  | "auto" // orchestrator assigned with high confidence
  | "needs_review" // orchestrator unsure — surfaced to the user
  | "confirmed"; // a human confirmed/overrode the category

export interface Categorization {
  categoryId: string | null;
  status: CategorizationStatus;
  /** 0..1 model/heuristic confidence for the current assignment */
  confidence: number;
  /** what the orchestrator would pick if asked again (may differ from categoryId) */
  suggestedCategoryId: string | null;
  /** short human-readable rationale, shown in the review queue */
  reasoning: string | null;
  /** which orchestrator build produced the assignment, for auditability */
  orchestratorVersion: string | null;
  decidedAt: ISODateTime | null;
}

export interface Transaction {
  /** Stable, opaque id. This is the ONLY transaction field the server may store in clear. */
  id: string;
  accountId: string;
  date: ISODate;
  amountCents: Cents;
  /** normalized merchant, e.g. "Whole Foods" */
  merchantName: string;
  /** raw bank descriptor, e.g. "WHOLEFDS #123 SEATTLE WA" */
  rawDescription: string;
  pending: boolean;
  /** where this row came from */
  source: "mock" | "plaid" | "manual" | "import";
  categorization: Categorization;
}

export type BudgetPeriod = "monthly";

export interface Budget {
  id: string;
  categoryId: string;
  period: BudgetPeriod;
  limitCents: Cents; // positive amount the user intends to cap spend at
}

// ---------------------------------------------------------------------------
// Derived / read models the UI consumes (computed client-side from the above)
// ---------------------------------------------------------------------------

export interface CategorySpend {
  categoryId: string;
  categoryName: string;
  color: string;
  spentCents: Cents; // absolute spend (positive)
  txnCount: number;
}

export interface MonthlyPoint {
  month: string; // "2026-05"
  spentCents: Cents;
  incomeCents: Cents;
}

export interface BudgetProgress {
  budget: Budget;
  categoryName: string;
  color: string;
  spentCents: Cents;
  limitCents: Cents;
  /** spentCents / limitCents, clamped reporting handled in UI */
  ratio: number;
}

export interface DashboardSummary {
  rangeStart: ISODate;
  rangeEnd: ISODate;
  totalSpentCents: Cents;
  totalIncomeCents: Cents;
  netCents: Cents;
  byCategory: CategorySpend[];
  monthly: MonthlyPoint[];
  topMerchants: { merchantName: string; spentCents: Cents; txnCount: number }[];
}

// ---------------------------------------------------------------------------
// Query / mutation DTOs
// ---------------------------------------------------------------------------

export interface TransactionQuery {
  /** free-text search across merchant + raw descriptor */
  search?: string;
  categoryIds?: string[];
  accountIds?: string[];
  status?: CategorizationStatus[];
  dateFrom?: ISODate;
  dateTo?: ISODate;
  minAmountCents?: Cents;
  maxAmountCents?: Cents;
  /** when true, only debits (spend); when false, only credits (income) */
  spendOnly?: boolean;
  limit?: number;
  cursor?: string; // opaque pagination cursor
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export interface DateRange {
  from: ISODate;
  to: ISODate;
}
