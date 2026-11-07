import type { CategorizationStatus, Category } from "../api/types";
import { useFinance } from "../store/FinanceContext";
import { Icon, categoryIcon, faTag } from "../lib/icons";

/** Stable hue from a string, so a merchant always gets the same colored chip. */
function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** A small round merchant "logo": the merchant's initial in a colored circle.
 *  A real logo provider (Plaid Enrich / Clearbit) would slot in behind this. */
export function MerchantLogo({ merchant, size = 34 }: { merchant: string; raw?: string; size?: number }) {
  const initial = (merchant.trim()[0] ?? "?").toUpperCase();
  const hue = hueFor(merchant || "?");
  return (
    <span
      className="merchant-logo"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        color: "#fff",
        border: "none",
        background: `hsl(${hue} 42% 34%)`,
      }}
    >
      {initial}
    </span>
  );
}

export function CategoryChip({ category }: { category: Category | undefined }) {
  if (!category)
    return (
      <span className="cui-chip cui-dim">
        <Icon icon={faTag} /> Uncategorized
      </span>
    );
  return (
    <span className="cui-chip">
      <Icon icon={categoryIcon(category.id)} style={{ color: category.color }} />
      {category.name}
    </span>
  );
}

const STATUS_LABEL: Record<CategorizationStatus, string> = {
  auto: "Auto",
  confirmed: "Confirmed",
  needs_review: "Needs review",
  uncategorized: "Uncategorized",
};

const STATUS_PILL: Record<CategorizationStatus, string> = {
  auto: "cui-pill",
  confirmed: "cui-pill cui-pill--success",
  needs_review: "cui-pill cui-pill--warn",
  uncategorized: "cui-pill pill-neutral",
};

export function StatusBadge({ status, confidence }: { status: CategorizationStatus; confidence?: number }) {
  const label = STATUS_LABEL[status];
  const conf = status === "auto" && confidence != null ? ` ${Math.round(confidence * 100)}%` : "";
  return <span className={STATUS_PILL[status]}>{label}{conf}</span>;
}

export function CategorySelect({
  value,
  onChange,
  allowNone = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
}) {
  const { categories } = useFinance();
  return (
    <select
      className="cui-input"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {allowNone && <option value="">Uncategorized</option>}
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="empty">{label}</div>;
}
