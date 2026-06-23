// Month-scope parsing for the categorization orchestrator.
//
// The ConjureOS orchestrator routes natural-language prompts like
// "do February's budget and categorize everything" into a `categorizeTransactions`
// action with a free-text `month` param ("February", "Feb 2026", "2026-02", …).
// This module turns that loose string into a concrete { year, month } scope so we
// only categorize the transactions in that month.
//
// Kept dependency-free (operates on ISO date strings, not Transaction objects) so
// it's trivially unit-testable and reusable.

/** A month with an explicit year resolved. month is 1-12. */
export interface MonthScope {
  year: number;
  month: number; // 1-12
}

/** A parsed month where the year may be unknown (e.g. a bare "February"). */
export interface ParsedMonth {
  year: number | null;
  month: number; // 1-12
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Parse a loose month string into a { year?, month }. Returns null when no
 * month can be found. Handles:
 *   - ISO "YYYY-MM"            → { year, month }
 *   - "February" / "feb"        → { year: null, month: 2 }
 *   - "February 2026"           → { year: 2026, month: 2 }
 *   - "2026 February"           → { year: 2026, month: 2 }
 *
 * Only explicit 4-digit years are honored. A bare 1-2 digit number is treated
 * as noise (likely a day, e.g. "February 14"), NOT a year — we scope to whole
 * months, so a day is irrelevant and guessing "14" → 2014 would be wrong.
 */
export function parseMonthInput(input: string): ParsedMonth | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // ISO YYYY-MM (optionally with a day we ignore).
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return { year, month };
    return null;
  }

  // Token scan: find a month word + optional 4-digit year anywhere.
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  let month: number | null = null;
  let year: number | null = null;
  for (const tok of tokens) {
    if (month == null && tok in MONTHS) {
      month = MONTHS[tok];
      continue;
    }
    if (year == null && /^\d{4}$/.test(tok)) {
      year = Number(tok);
      continue;
    }
  }
  if (month == null) return null;
  return { year, month };
}

/**
 * Resolve a loose month string against the dates actually present, filling in
 * the year when the user didn't give one. For a bare "February" we pick the
 * most recent year that has any data in February; if February has no data we
 * fall back to the latest year present (so the label is sensible and the run
 * simply matches nothing). Returns null when the string names no month at all.
 */
export function resolveMonthScope(input: string, isoDates: readonly string[]): MonthScope | null {
  const parsed = parseMonthInput(input);
  if (!parsed) return null;
  if (parsed.year != null) return { year: parsed.year, month: parsed.month };

  // Year omitted — infer from the data.
  let latestYearForMonth = -Infinity;
  let latestYearOverall = -Infinity;
  for (const d of isoDates) {
    const m = d.match(/^(\d{4})-(\d{2})/);
    if (!m) continue;
    const y = Number(m[1]);
    if (y > latestYearOverall) latestYearOverall = y;
    if (Number(m[2]) === parsed.month && y > latestYearForMonth) latestYearForMonth = y;
  }
  const year =
    latestYearForMonth > -Infinity
      ? latestYearForMonth
      : latestYearOverall > -Infinity
        ? latestYearOverall
        : new Date().getUTCFullYear();
  return { year, month: parsed.month };
}

/** True when an ISO date ("2026-02-14") falls within the scope's year+month. */
export function isInScope(isoDate: string, scope: MonthScope): boolean {
  const m = isoDate.match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return Number(m[1]) === scope.year && Number(m[2]) === scope.month;
}

/** Human label for a scope, e.g. "February 2026". */
export function formatScope(scope: MonthScope): string {
  const name = MONTH_NAMES[scope.month - 1] ?? `Month ${scope.month}`;
  return `${name} ${scope.year}`;
}
