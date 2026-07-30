import type {
  AllCasesRow,
  CaseRef,
  CaseWorkloadResponse,
  RowStatus,
} from '../../core/models/monitoring';
import { ROW_STATUS_COLORS } from '../constants';
import { caseRefKey } from './case-age';

// ── KPI: per-person case workload ─────────────────────────────────────────────
// There is no assignee in the schema. A person is "on" a case if they touched it —
// commented, or changed its status — during the selected month.

export const KPI_DESCRIPTION =
  'Who worked which cases this month. There is no assignee field, so a person is credited ' +
  'with a case when they comment on it or change its status. A case two people touched ' +
  'appears under both, so the cards deliberately overlap — never add them up. The month ' +
  'scopes the touch, not the case: a case you worked in June and have not touched this ' +
  'month moves to Unattended.';

/** Reserved `person` route values for the two non-person cards. Real values are emails. */
export const BUCKET_UNATTENDED = 'unattended';
export const BUCKET_UNATTRIBUTED = 'unattributed';

export type StatusCounts = Record<RowStatus, number>;

const ZERO_COUNTS: StatusCounts = { OPEN: 0, IN_PROGRESS: 0, DONE: 0 };

export const activeOf = (c: StatusCounts): number => c.OPEN + c.IN_PROGRESS;
export const totalOf = (c: StatusCounts): number => c.OPEN + c.IN_PROGRESS + c.DONE;

/**
 * Counts the current status of each referenced case, and returns the keys that actually
 * resolved to one.
 *
 * A ref matching no row is **orphaned**, not zero: it points at a case key that no longer
 * exists, which happens when an item's `identity_columns` change without the activity
 * timeline being re-pointed.
 *
 * `keys` therefore excludes orphans, and every caller must use it rather than the raw refs.
 * Counting a case that does not exist would inflate the header stat and break the identity
 * `touched + unattributed + unattended + dormant = total cases` by exactly the orphan
 * count — an off-by-a-few that looks like a rounding bug and is not one.
 */
export function countStatuses(
  refs: CaseRef[],
  statusByKey: Map<string, RowStatus>,
): { counts: StatusCounts; orphaned: number; keys: Set<string> } {
  const counts: StatusCounts = { ...ZERO_COUNTS };
  const keys = new Set<string>();
  let orphaned = 0;
  for (const ref of refs) {
    const key = caseRefKey(ref);
    const status = statusByKey.get(key);
    if (!status) {
      orphaned++;
      continue;
    }
    counts[status]++;
    keys.add(key);
  }
  return { counts, orphaned, keys };
}

/** Status wedges, empty ones dropped. Same shape and colours as the Home and Category pies. */
export function statusPieData(
  counts: StatusCounts,
): { name: string; value: number; color: string }[] {
  return [
    { name: 'Open', value: counts.OPEN, color: ROW_STATUS_COLORS.OPEN },
    { name: 'In Progress', value: counts.IN_PROGRESS, color: ROW_STATUS_COLORS.IN_PROGRESS },
    { name: 'Done', value: counts.DONE, color: ROW_STATUS_COLORS.DONE },
  ].filter((d) => d.value > 0);
}

export interface PersonCard {
  email: string;
  name: string | null;
  isYou: boolean;
  counts: StatusCounts;
  orphaned: number;
  keys: Set<string>;
}

export interface KpiData {
  people: PersonCard[];
  /** Cases nobody touched this month and that are not yet DONE — the stale backlog. */
  unattended: { counts: StatusCounts; keys: Set<string> };
  /** Touched this month, but only by authorless entries. */
  unattributed: { counts: StatusCounts; keys: Set<string>; orphaned: number };
  /** Finished earlier, untouched this month. Counted so the arithmetic closes; never drawn. */
  dormant: number;
  /** Distinct cases touched by a person — NOT the sum of the cards. */
  touchedTotal: number;
  orphaned: number;
}

export const EMPTY_KPI: KpiData = {
  people: [],
  unattended: { counts: { ...ZERO_COUNTS }, keys: new Set() },
  unattributed: { counts: { ...ZERO_COUNTS }, keys: new Set(), orphaned: 0 },
  dormant: 0,
  touchedTotal: 0,
  orphaned: 0,
};

/**
 * Everything the KPI tab draws, derived from the workload response plus the case rows the
 * dashboard already holds. The rows stay the single source of truth for status, so a pie
 * can never disagree with the grid it drills into.
 */
export function buildKpiData(workload: CaseWorkloadResponse, caseRows: AllCasesRow[]): KpiData {
  const statusByKey = new Map(caseRows.map((r) => [caseRefKey(r), r.rowStatus]));

  const people: PersonCard[] = workload.people.map((p) => {
    const { counts, orphaned, keys } = countStatuses(p.cases, statusByKey);
    // `keys` (not `p.cases`) is what the drill-down locks to, so the grid's row count is
    // the pie's total by construction.
    return { email: p.authorEmail, name: p.authorName, isYou: p.isYou, counts, orphaned, keys };
  });

  // Yourself first — people look for their own card. Then the busiest. The email tiebreak
  // is not pedantry: without it, equal-count cards reshuffle on every refetch and read as
  // a bug.
  people.sort(
    (a, b) =>
      Number(b.isYou) - Number(a.isYou) ||
      activeOf(b.counts) - activeOf(a.counts) ||
      totalOf(b.counts) - totalOf(a.counts) ||
      a.email.localeCompare(b.email),
  );

  const unattributed = countStatuses(workload.unattributed, statusByKey);

  // A case belongs to the person who touched it; only what nobody claimed is left over.
  // Orphans are already gone from every `keys` set, so `claimed` counts real cases only.
  const claimed = new Set<string>();
  for (const p of people) for (const k of p.keys) claimed.add(k);

  const untouched = caseRows.filter(
    (r) => !claimed.has(caseRefKey(r)) && !unattributed.keys.has(caseRefKey(r)),
  );

  // DONE cases nobody touched this month are dormant, not neglected. Drawing them would
  // rebuild the all-time green disc that monthly scoping exists to prevent.
  const stale = untouched.filter((r) => r.rowStatus !== 'DONE');
  const unattendedCounts: StatusCounts = { ...ZERO_COUNTS };
  for (const r of stale) unattendedCounts[r.rowStatus]++;

  return {
    people,
    unattended: { counts: unattendedCounts, keys: new Set(stale.map(caseRefKey)) },
    unattributed,
    dormant: untouched.length - stale.length,
    touchedTotal: claimed.size,
    orphaned: people.reduce((n, p) => n + p.orphaned, 0) + unattributed.orphaned,
  };
}
