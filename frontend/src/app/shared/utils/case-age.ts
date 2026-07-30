import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { CaseKeySource } from '../../core/models/monitoring';
import { pluralS } from './plural';

// ── Case age ─────────────────────────────────────────────────────────────────
// Cases bucketed by how long ago they were *first seen*, on a log-ish scale: narrow
// bands where recency matters, widening as cases age. A flat daily cut would leave an
// item with a year of history rendering as one gray wedge and seven slivers.
//
// Lower bound in days, ascending. Parallel to CASE_AGE_COLORS — re-cutting the scale
// is an edit to these two arrays and nothing else.
export const CASE_AGE_BUCKETS = [
  { minDays: 0, label: 'Today' },
  { minDays: 1, label: 'Yesterday' },
  { minDays: 2, label: '2–3 days ago' },
  { minDays: 4, label: '4–6 days ago' },
  { minDays: 7, label: '1–2 weeks' },
  { minDays: 14, label: '2–4 weeks' },
  { minDays: 30, label: '1–3 months' },
  { minDays: 90, label: '90+ days' },
] as const;

export const CASE_AGE_COLORS = [
  '#dc2626', '#ea580c', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#6b7280',
];

export const CASE_AGE_DESCRIPTION =
  'Open cases grouped by when they were first seen. A case keeps its original first-seen ' +
  'date when it recurs, so a long-running case ages rather than resetting. Cases on items ' +
  'without a configured identity are excluded — their identity changes every run, so they ' +
  'cannot be aged.';

/** Whole days between two `yyyy-MM-dd` dates, never negative. */
export function daysOpen(firstSeen: string, today: string): number {
  try {
    return Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(firstSeen)));
  } catch {
    return 0;
  }
}

/** `2026-07` → `July 2026`. */
export function monthLabel(month: string): string {
  return format(parseISO(`${month}-01`), 'MMMM yyyy');
}

/** Steps a `yyyy-MM` by whole months. Crosses year boundaries; never produces `2026-13`. */
export function shiftMonth(month: string, delta: number): string {
  return format(addMonths(parseISO(`${month}-01`), delta), 'yyyy-MM');
}

/** The identity a case row and a `CaseRef` are joined on. */
export function caseRefKey(ref: { msorId: number; caseKey: string }): string {
  return `${ref.msorId}:${ref.caseKey}`;
}

/** Index into CASE_AGE_BUCKETS. `firstSeen` and `today` are both `yyyy-MM-dd`. */
export function caseAgeBucket(firstSeen: string, today: string): number {
  // A first_date in the future (skewed client clock) folds into Today rather than
  // producing a negative index: a silent bucket beats an out-of-range crash.
  const days = Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(firstSeen)));
  for (let i = CASE_AGE_BUCKETS.length - 1; i >= 0; i--) {
    if (days >= CASE_AGE_BUCKETS[i].minDays) return i;
  }
  return 0; // unreachable: minDays[0] === 0 and days >= 0
}

/** A row-hash case key churns every run, so its first-seen date is meaningless. */
export function isAgeable(row: { caseKeySource: CaseKeySource | null }): boolean {
  return row.caseKeySource !== 'ROW_HASH';
}

export interface CaseAgeSlice {
  name: string;
  value: number;
  color: string;
}

export interface CaseAgeData {
  slices: CaseAgeSlice[];
  /** Cases actually bucketed. */
  total: number;
  /** Cases dropped because their key is a row-hash — a real, explainable exclusion. */
  excluded: number;
  /** Cases whose first-seen date could not be looked up — stale or failed fetch, not a data property. */
  unknown: number;
}

export const EMPTY_CASE_AGE: CaseAgeData = { slices: [], total: 0, excluded: 0, unknown: 0 };

/**
 * Buckets the rows a page already renders, using `firstSeenByKey` purely as a lookup.
 *
 * Bucketing the page's own rows — rather than piing the /monitoring-result-rows payload
 * directly — is what keeps this pie's total equal to the number the page already
 * advertises. That endpoint returns every case ever recorded, including cases long gone
 * from the latest run.
 *
 * `excluded` and `unknown` are counted apart on purpose: the first says "this case has no
 * stable identity", the second says "we could not load first-seen dates". Reporting the
 * second as the first would blame the data for a network failure.
 */
export function buildCaseAgeData(
  rows: { msorId: number; caseKey: string; caseKeySource: CaseKeySource | null }[],
  firstSeenByKey: Map<string, string>,
  today: string,
): CaseAgeData {
  const counts = new Array<number>(CASE_AGE_BUCKETS.length).fill(0);
  let excluded = 0;
  let unknown = 0;
  let total = 0;
  for (const row of rows) {
    if (!isAgeable(row)) {
      excluded++;
      continue;
    }
    const firstSeen = firstSeenByKey.get(`${row.msorId}:${row.caseKey}`);
    if (!firstSeen) {
      unknown++;
      continue;
    }
    counts[caseAgeBucket(firstSeen, today)]++;
    total++;
  }
  const slices = CASE_AGE_BUCKETS.map((b, i) => ({
    name: b.label,
    value: counts[i],
    color: CASE_AGE_COLORS[i],
  })).filter((s) => s.value > 0);
  return { slices, total, excluded, unknown };
}

/**
 * "{n} of {total} cases · {k} excluded" — the excluded clause disappears at k = 0, so the
 * caveat is only shown when it is true. Seeding identity_columns empties it for good.
 * `unknown` counts toward the denominator so the pie never overstates its own coverage.
 */
export function caseAgeSubtitle({ slices, total, excluded, unknown }: CaseAgeData): string {
  if (total === 0) {
    return excluded > 0 ? `${excluded} case${pluralS(excluded)} excluded` : 'No cases';
  }
  const considered = total + excluded + unknown;
  const head =
    considered > total ? `${total} of ${considered} cases` : `${total} case${pluralS(total)}`;
  const tail =
    excluded > 0
      ? ` · ${excluded} excluded`
      : ` · oldest ${slices[slices.length - 1].name.toLowerCase()}`;
  return head + tail;
}
