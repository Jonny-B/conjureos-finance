import type { CategorizationStatus, Category } from "../api/types";
import { useFinance } from "../store/FinanceContext";

export function CategoryChip({ category }: { category: Category | undefined }) {
  if (!category) return <span className="chip muted">Uncategorized</span>;
  return (
    <span className="chip">
      <span className="dot" style={{ background: category.color }} />
      {category.icon} {category.name}
    </span>
  );
}

const STATUS_LABEL: Record<CategorizationStatus, string> = {
  auto: "Auto",
  confirmed: "Confirmed",
  needs_review: "Needs review",
  uncategorized: "Uncategorized",
};

export function StatusBadge({ status, confidence }: { status: CategorizationStatus; confidence?: number }) {
  const label = STATUS_LABEL[status];
  const conf = status === "auto" && confidence != null ? ` ${Math.round(confidence * 100)}%` : "";
  return <span className={`status ${status}`}>{label}{conf}</span>;
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
      className="select"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {allowNone && <option value="">Uncategorized</option>}
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.icon} {c.name}
        </option>
      ))}
    </select>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="empty">{label}</div>;
}
