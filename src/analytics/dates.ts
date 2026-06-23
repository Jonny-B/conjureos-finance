// Small UTC-based date helpers for analytics. Transaction dates are plain
// calendar strings ("2026-02-14"); we treat them as UTC midnight so interval
// math is timezone-stable and deterministic in tests.

export const DAY_MS = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, "0");

export function isoToMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1);
}

export function msToISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(iso: string, days: number): string {
  return msToISO(isoToMs(iso) + days * DAY_MS);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((isoToMs(b) - isoToMs(a)) / DAY_MS);
}

/** "2026-02-14" -> "2026-02" */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Latest date present, or a floor when the list is empty. */
export function maxDate(isoDates: readonly string[]): string {
  return isoDates.reduce((m, d) => (d > m ? d : m), "0000-00-00");
}
