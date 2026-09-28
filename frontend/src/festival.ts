export type Festival = 'diwali' | 'navratri' | 'holi' | 'republic' | 'independence';

// Inclusive [start, end] windows (YYYY-MM-DD). ponytail: hard-coded dates; add the next year's dates each December.
const WINDOWS: [Festival, string, string][] = [
  ['navratri', '2026-10-11', '2026-10-20'],
  ['diwali', '2026-11-05', '2026-11-12'],
  ['republic', '2027-01-24', '2027-01-27'],
  ['holi', '2027-03-20', '2027-03-23'],
  ['independence', '2027-08-13', '2027-08-16'],
  ['navratri', '2027-09-30', '2027-10-09'],
  ['diwali', '2027-10-26', '2027-11-01'],
];

const FESTIVALS = new Set<string>(['diwali', 'navratri', 'holi', 'republic', 'independence']);

export function festivalFor(date: Date, override?: string | null): Festival | null {
  if (override && FESTIVALS.has(override)) return override as Festival;
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return WINDOWS.find(([, start, end]) => day >= start && day <= end)?.[0] ?? null;
}
