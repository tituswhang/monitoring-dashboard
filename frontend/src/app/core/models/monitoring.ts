export type ResultStatus = "SUCCESS" | "FAIL" | "SKIPPED";
export type RowStatus = "OPEN" | "IN_PROGRESS" | "DONE";

export interface MonitoringQuery {
  msorId: number;
  title: string;
  description: string | null;
  dbType: string;
  category: string;
  sqlQuery: string;
  queryInterval: string | null;
  sheetName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  recipients: string | null;
  activeYn: "Y" | "N";
  frequentYn: "Y" | "N";
  onHoldYn: "Y" | "N";
  color: string | null;
  /**
   * Whether this item's SQL takes its date range from the caller. Items still carrying a
   * literal date floor ignore `beginDate`/`endDate` on the run endpoint, so the scan-range
   * controls are hidden for them rather than shown doing nothing.
   */
  dateRangeSupported: boolean;
  /** Days a scheduled run looks back. The window is `[today - N, today]`, inclusive. */
  defaultLookbackDays: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Which strategy produced a row's `caseKey`. Only `ROW_HASH` is unstable — it hashes
 * the whole row, so the key churns whenever any field changes and the case looks brand
 * new on every run. Such rows cannot be aged by first sighting and are excluded from
 * the Case Age pie. `null` for rows written before the column existed.
 */
export type CaseKeySource = "INCREMENT_ID" | "IDENTITY_COLUMNS" | "ORDER_ID" | "ROW_HASH";

export interface MonitoringResultRow {
  rowId: number;
  rowStatus: RowStatus;
  rowComment: string | null;
  caseKey: string;
  caseKeySource: CaseKeySource | null;
  activityCount: number;
  data: Record<string, unknown>;
}

export type CaseActivityType = "COMMENT" | "STATUS_CHANGE" | "DATA_CHANGE";

export interface CaseActivity {
  activityId: number;
  entryType: CaseActivityType;
  authorName: string | null;
  authorEmail: string | null;
  commentText: string | null;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface MonitoringResult {
  resultId: number;
  msorId: number;
  runAt: string;
  runDate: string;
  /** Cases this run recorded. Excludes those withheld for being already DONE — see `suppressedCount`. */
  resultCount: number;
  /**
   * Cases the query matched but this run withheld, because a user had already marked them Done.
   * They keep their rows in the earlier runs they appeared in; they are simply no longer tracked
   * or alerted on. Without this, `resultCount: 0` would conflate "triage is caught up" with
   * "the query matched nothing". Always 0 for runs that predate suppression.
   */
  suppressedCount: number;
  resultStatus: ResultStatus;
  executionMs: number | null;
  errorMessage: string | null;
  errorDetail: string | null;
  /**
   * First day this run scanned, inclusive. Null for runs recorded before the window existed,
   * and for items that still carry a literal date floor — in both cases the range is genuinely
   * unknown, which is why it is not defaulted to something plausible.
   */
  beginDate: string | null;
  /** Last day this run scanned, **inclusive** — the day an operator would name, not the exclusive bound. */
  endDate: string | null;
  /**
   * `Y` when this was a widened "past unresolved cases" scan, which reaches back to the
   * configured floor instead of the rolling window. Its `resultCount` is therefore not
   * comparable with the daily runs around it.
   */
  pastUnresolvedYn: "Y" | "N";
  triggeredAlertYn: "Y" | "N";
  dwSyncedYn: "Y" | "N";
  createdAt: string;
  rows: MonitoringResultRow[];
}

export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

export interface AllCasesRow {
  rowId: number;
  rowStatus: RowStatus;
  rowComment: string | null;
  caseKey: string;
  caseKeySource: CaseKeySource | null;
  activityCount: number;
  data: Record<string, unknown>;
  resultId: number;
  msorId: number;
  title: string;
  dbType: string;
  /**
   * **The case's first-seen date, not the run date.** The backend aliases
   * `MIN(run_date) OVER (PARTITION BY msor_id, case_key)` to `runDate` on the wire, and
   * `fromDate`/`toDate` filter on *that* date. The grid column is labelled "First Seen"
   * for the same reason. Renaming the wire field would be a breaking change for no
   * user-visible gain; prefer the `firstSeenDate` alias below in new code.
   */
  runDate: string;
}

/** Reads `AllCasesRow.runDate` under the name it actually carries. */
export const firstSeenDate = (row: AllCasesRow): string => row.runDate;

export interface AllCasesFilters {
  dbType?: string;
  rowStatus?: string;
  fromDate?: string;
  toDate?: string;
  msorId?: number;
}

// ── KPI: per-person case workload ────────────────────────────────────────────

/** A case's stable identity. Join against `AllCasesRow` on `${msorId}:${caseKey}`. */
export interface CaseRef {
  msorId: number;
  caseKey: string;
}

/**
 * The distinct cases one person touched (commented on, or changed the status of) during
 * the requested month.
 *
 * Membership is **not exclusive**: a case two people both touched appears in both of
 * their lists. Summing `cases.length` across people therefore over-counts, and is never
 * a case count — use the distinct union.
 */
export interface PersonWorkload {
  authorEmail: string;
  /** Null when the user has no Cognito `name`; display the email instead. */
  authorName: string | null;
  /** Resolved server-side: Cognito omits `email` from access tokens, so we cannot know this. */
  isYou: boolean;
  cases: CaseRef[];
}

/**
 * Who touched which case during one calendar month. Carries **no statuses** — the client
 * already holds every case row, so status is read from the row and the pie cannot drift
 * from the grid beneath it.
 */
export interface CaseWorkloadResponse {
  /** The month answered, `yyyy-MM`. Echoed, so we never guess the server's idea of "current". */
  month: string;
  /** First month holding any activity; null when the timeline is empty. Floors the selector. */
  earliestMonth: string | null;
  people: PersonWorkload[];
  /** Cases touched this month only by authorless entries (demo mode, legacy comments). */
  unattributed: CaseRef[];
}
